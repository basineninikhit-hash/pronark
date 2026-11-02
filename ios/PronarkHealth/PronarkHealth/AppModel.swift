import Foundation
import HealthKit
import Supabase
import UIKit

/// The shared Supabase client. Same project and public key as the web app; the signed-in
/// member's token decides what the database lets this app read and write.
enum Pronark {
    static let host = Bundle.main.object(forInfoDictionaryKey: "PronarkSupabaseHost") as? String ?? ""
    static let anonKey = Bundle.main.object(forInfoDictionaryKey: "PronarkSupabaseAnonKey") as? String ?? ""
    static var isConfigured: Bool { !host.isEmpty && !anonKey.isEmpty && !host.hasPrefix("your-") && !host.hasPrefix("$(") }
    static let client = SupabaseClient(supabaseURL: URL(string: "https://\(isConfigured ? host : "localhost")")!, supabaseKey: anonKey)
    /// Must be listed in Supabase → Authentication → URL Configuration → Redirect URLs.
    static let redirect = URL(string: "pronark://login-callback")!
}

private struct LinkRow: Codable { let kind: String; let workout_types: [String] }
private struct ConnectionParams: Encodable { let p_steps: Bool; let p_workouts: Bool; let p_device_label: String }
private struct SubmitParams: Encodable { let p_batch: UUID; let p_values: [HealthValue] }
private struct SubmitResult: Decodable { let accepted: Int; let ignored: Int; let suggested: Int; let duplicate: Bool? }

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    @Published private(set) var signedIn = false
    @Published private(set) var email = ""
    @Published private(set) var busy = false
    @Published private(set) var status = ""
    @Published private(set) var lastSync: Date? = UserDefaults.standard.object(forKey: "lastSync") as? Date
    @Published private(set) var linkSummary = ""

    private let client = Pronark.client
    private let health = HealthReader.shared
    private let queue = SyncQueue.shared

    /// The last links seen, so a sync can still read and queue totals while offline.
    private var cachedLinks: [LinkRow] {
        get { (UserDefaults.standard.data(forKey: "links")).flatMap { try? JSONDecoder().decode([LinkRow].self, from: $0) } ?? [] }
        set { UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: "links") }
    }

    /// Called at every launch (including background launches) so Health can wake the app.
    func registerObservers() {
        let links = cachedLinks
        guard client.auth.currentSession != nil, !links.isEmpty else { return }
        health.observeChanges(steps: links.contains { $0.kind == "steps" }, workouts: links.contains { $0.kind == "workouts" }) {
            await AppModel.shared.sync()
        }
    }

    func watchSession() async {
        for await (_, session) in client.auth.authStateChanges {
            signedIn = session != nil
            email = session?.user.email ?? ""
            if signedIn { await sync() }
        }
    }

    func signIn() async {
        guard Pronark.isConfigured else { status = "This build is missing its Supabase settings. See ios/README.md."; return }
        // Always show Google's account picker, so a different Google account can be chosen.
        do { _ = try await client.auth.signInWithOAuth(provider: .google, redirectTo: Pronark.redirect, queryParams: [(name: "prompt", value: "select_account")]) }
        catch { status = "Sign-in didn't finish: \(error.localizedDescription)" }
    }

    func signOut() async {
        try? await client.auth.signOut()
        // Forget everything from this account, so the next one starts clean.
        queue.clear()
        cachedLinks = []
        lastSync = nil
        linkSummary = ""
        UserDefaults.standard.removeObject(forKey: "lastSync")
        status = "Signed out. Nothing more will be read from Apple Health."
    }

    /// Unlinks every activity and deletes every Health total Pronark stored. Confirmed check-ins stay.
    func disconnect() async {
        busy = true; defer { busy = false }
        do {
            try await client.rpc("disconnect_health").execute()
            queue.clear()
            cachedLinks = []
            status = "Disconnected. Pronark deleted the Health totals it stored. To stop all access, also open Settings → Health → Data Access & Devices."
        } catch { status = "Couldn't disconnect: \(error.localizedDescription)" }
    }

    /// Reads this month's totals for what the linked activities need, queues them, then uploads.
    func sync() async {
        guard signedIn || client.auth.currentSession != nil, !busy else { return }
        busy = true; defer { busy = false }
        guard health.isAvailable else { status = "Apple Health isn't available on this device."; return }

        var links = cachedLinks
        var online = true
        do {
            links = try await client.from("health_activity_links").select("kind,workout_types").execute().value
            cachedLinks = links
        } catch { online = false }

        let steps = links.contains { $0.kind == "steps" }, workouts = links.contains { $0.kind == "workouts" }
        linkSummary = summary(links)
        if online {
            // Tells Pronark which data types to accept. Turning one off deletes its stored totals.
            try? await client.rpc("save_health_connection", params: ConnectionParams(p_steps: steps, p_workouts: workouts, p_device_label: UIDevice.current.model)).execute()
        }
        guard steps || workouts else {
            status = "No activities use Apple Health yet. In Pronark, open Settings → Apple Health and pick one."
            return
        }

        do {
            try await health.requestAccess(steps: steps, workouts: workouts)
            health.observeChanges(steps: steps, workouts: workouts) { await AppModel.shared.sync() }
            // "Any workout" needs every kind; otherwise only the kinds that were picked are uploaded.
            let workoutLinks = links.filter { $0.kind == "workouts" }
            let filter: Set<String>? = workoutLinks.contains { $0.workout_types.isEmpty } ? nil : Set(workoutLinks.flatMap(\.workout_types))
            let values = try await readMonth(steps: steps, workouts: workouts, workoutFilter: filter)
            queue.add(PendingBatch(id: UUID(), createdAt: .now, values: values))
        } catch let error as HKError where error.code == .errorDatabaseInaccessible {
            // The phone is locked; Health data can't be read until it's unlocked.
        } catch {
            status = "Couldn't read Apple Health: \(error.localizedDescription)"
        }
        await upload()
    }

    private func upload() async {
        var suggested = 0
        do {
            try await queue.flush { batch in
                let result: SubmitResult = try await self.client.rpc("submit_health_values", params: SubmitParams(p_batch: batch.id, p_values: batch.values)).execute().value
                if result.duplicate != true { suggested += result.suggested }
            }
            lastSync = .now
            UserDefaults.standard.set(lastSync, forKey: "lastSync")
            status = suggested == 0 ? "Up to date." : "\(suggested) new suggestion\(suggested == 1 ? "" : "s"). Open Pronark to confirm."
        } catch {
            status = "Saved on this iPhone. It will upload when you're back online."
        }
    }

    /// One total per New York day this month, including days with nothing (zero), so data
    /// deleted from Health also clears its suggestion.
    private func readMonth(steps: Bool, workouts: Bool, workoutFilter: Set<String>?) async throws -> [HealthValue] {
        let days = PronarkDay.thisMonth()
        guard let first = days.first, let last = days.last else { return [] }
        let observed = ISO8601DateFormatter().string(from: .now)
        var values: [HealthValue] = []

        if steps {
            for day in days {
                let count = try await health.steps(on: day)
                values.append(HealthValue(kind: "steps", date: day.key, value: min(count.rounded(), 200_000), details: nil, source: "Apple Health", observed_at: observed))
            }
        }
        if workouts {
            var minutes: [String: [String: Double]] = [:], sources: [String: Set<String>] = [:]
            for workout in try await health.workouts(from: first.start, to: last.end) {
                let kind = WorkoutKind.key(for: workout.workoutActivityType)
                if let workoutFilter, !workoutFilter.contains(kind) { continue }
                let day = PronarkDay.key(for: workout.startDate)
                minutes[day, default: [:]][kind, default: 0] += workout.duration / 60
                sources[day, default: []].insert(workout.sourceRevision.source.name)
            }
            for day in days {
                let byKind = (minutes[day.key] ?? [:]).mapValues { min(($0 * 10).rounded() / 10, 1440) }
                let total = min(byKind.values.reduce(0, +), 1440)
                let names = sources[day.key]?.sorted().joined(separator: ", ") ?? ""
                values.append(HealthValue(kind: "workouts", date: day.key, value: total, details: byKind,
                                          source: String((names.isEmpty ? "Apple Health" : "Apple Health · \(names)").prefix(80)), observed_at: observed))
            }
        }
        return values
    }

    private func summary(_ links: [LinkRow]) -> String {
        let steps = links.filter { $0.kind == "steps" }.count, workouts = links.filter { $0.kind == "workouts" }.count
        let parts = [steps > 0 ? "\(steps) using steps" : nil, workouts > 0 ? "\(workouts) using workouts" : nil].compactMap { $0 }
        return parts.isEmpty ? "No linked activities" : parts.joined(separator: " · ")
    }
}
