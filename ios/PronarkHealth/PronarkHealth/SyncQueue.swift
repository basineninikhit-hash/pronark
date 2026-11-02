import Foundation

/// One day's total for one data type, exactly as `submit_health_values` expects it.
struct HealthValue: Codable {
    let kind: String              // "steps" or "workouts"
    let date: String              // New York day, "2026-07-15"
    let value: Double             // steps, or total workout minutes
    let details: [String: Double]? // workouts only: minutes per workout kind
    let source: String
    let observed_at: String       // when the phone read it; the server keeps the newest
}

struct PendingBatch: Codable {
    let id: UUID                  // the server ignores a batch id it has already seen
    let createdAt: Date
    let values: [HealthValue]
}

/// Uploads that haven't reached Pronark yet, kept on disk so they survive being offline or the
/// app closing. Sending the same batch twice is harmless.
@MainActor
final class SyncQueue {
    static let shared = SyncQueue()
    private let file: URL = {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appendingPathComponent("pending-health-batches.json")
    }()

    var count: Int { load().count }

    func add(_ batch: PendingBatch) {
        // Each batch is a full re-read of the month, so only the newest few matter. Anything from
        // an earlier month would be ignored by the server anyway.
        let cutoff = Date.now.addingTimeInterval(-35 * 24 * 3600)
        save(Array((load() + [batch]).filter { $0.createdAt > cutoff }.suffix(5)))
    }

    /// Sends batches oldest first and stops at the first failure, keeping the rest for later.
    func flush(_ send: (PendingBatch) async throws -> Void) async throws {
        var pending = load()
        while let batch = pending.first {
            try await send(batch)
            pending.removeFirst()
            save(pending)
        }
    }

    func clear() { save([]) }

    private func load() -> [PendingBatch] {
        guard let data = try? Data(contentsOf: file) else { return [] }
        return (try? JSONDecoder().decode([PendingBatch].self, from: data)) ?? []
    }

    private func save(_ batches: [PendingBatch]) {
        guard let data = try? JSONEncoder().encode(batches) else { return }
        // Readable after the first unlock, so background Health updates can still queue.
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
