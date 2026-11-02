import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Pronark Health").font(.title2.bold())
                        Text("Sends your daily steps and workout minutes to Pronark so it can suggest check-ins. Nothing is checked off until you confirm it in Pronark.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                if model.signedIn {
                    Section("Status") {
                        LabeledContent("Signed in", value: model.email.isEmpty ? "Yes" : model.email)
                        LabeledContent("Activities", value: model.linkSummary.isEmpty ? "Checking…" : model.linkSummary)
                        LabeledContent("Last upload", value: model.lastSync.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "Not yet")
                        if !model.status.isEmpty { Text(model.status).font(.footnote) }
                    }
                    Section {
                        Button {
                            Task { await model.sync() }
                        } label: {
                            HStack { Text("Sync now"); Spacer(); if model.busy { ProgressView() } }
                        }
                        .disabled(model.busy)
                    } footer: {
                        Text("Choose which activities use steps or workouts in Pronark → Settings → Apple Health.")
                    }
                    Section {
                        Button("Disconnect and delete Health data", role: .destructive) { Task { await model.disconnect() } }
                            .disabled(model.busy)
                        Button("Sign out") { Task { await model.signOut() } }
                    }
                } else {
                    Section {
                        Button("Sign in with Google") { Task { await model.signIn() } }
                        if !model.status.isEmpty { Text(model.status).font(.footnote) }
                    } footer: {
                        Text("Use the same Google account you use for Pronark.")
                    }
                }

                Section("Privacy") {
                    Text("Pronark reads only your step count and workout minutes for this month, and only for activities you link. It never reads your location, routes or other Health data. Your numbers are visible only to you and are never used for advertising or shared with your groups.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
