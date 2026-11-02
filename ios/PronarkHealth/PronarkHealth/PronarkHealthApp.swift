import SwiftUI
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Health may launch the app in the background after a change; observers must be ready.
        MainActor.assumeIsolated { AppModel.shared.registerObservers() }
        return true
    }
}

@main
struct PronarkHealthApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @ObservedObject private var model = AppModel.shared
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .task { await model.watchSession() }
                .onOpenURL { url in Pronark.client.auth.handle(url) }
                .onChange(of: phase) { _, now in
                    if now == .active { Task { await model.sync() } }
                }
        }
    }
}
