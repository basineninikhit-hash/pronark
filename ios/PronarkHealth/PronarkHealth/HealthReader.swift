import HealthKit

/// Reads daily totals only: the step count, and workout minutes by workout kind. It never asks
/// for workout routes, heart rate, location or write access.
final class HealthReader {
    static let shared = HealthReader()
    let store = HKHealthStore()
    private let stepType = HKQuantityType(.stepCount)
    private let workoutType = HKObjectType.workoutType()
    private var observing = Set<HKSampleType>()

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Only the types the member's linked activities need.
    func sampleTypes(steps: Bool, workouts: Bool) -> [HKSampleType] {
        (steps ? [stepType] : []) + (workouts ? [workoutType] : [])
    }

    /// Shows Apple's permission sheet for any of these types that haven't been asked about yet.
    /// HealthKit never says whether reading was allowed; a denied type just reads as no data.
    func requestAccess(steps: Bool, workouts: Bool) async throws {
        let types = Set<HKObjectType>(sampleTypes(steps: steps, workouts: workouts))
        guard !types.isEmpty else { return }
        try await store.requestAuthorization(toShare: [], read: types)
    }

    /// Total steps for one New York day. Health merges iPhone and Apple Watch steps without
    /// double-counting them.
    func steps(on day: PronarkDay.Day) async throws -> Double {
        let predicate = HKQuery.predicateForSamples(withStart: day.start, end: day.end)
        let query = HKStatisticsQueryDescriptor(predicate: .quantitySample(type: stepType, predicate: predicate), options: .cumulativeSum)
        do {
            return try await query.result(for: store)?.sumQuantity()?.doubleValue(for: .count()) ?? 0
        } catch let error as HKError where error.code == .errorNoData {
            return 0
        }
    }

    /// Workouts that started in this range.
    func workouts(from start: Date, to end: Date) async throws -> [HKWorkout] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let query = HKSampleQueryDescriptor(predicates: [.workout(predicate)], sortDescriptors: [SortDescriptor(\.startDate)])
        return try await query.result(for: store)
    }

    /// Wakes the app when these types change, including deleted samples, at most about hourly.
    /// Must be set up at every launch, including background launches.
    func observeChanges(steps: Bool, workouts: Bool, onChange: @escaping () async -> Void) {
        for type in sampleTypes(steps: steps, workouts: workouts) where !observing.contains(type) {
            observing.insert(type)
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
                guard error == nil else { completion(); return }
                Task { await onChange(); completion() }
            }
            store.execute(query)
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }
}

/// The workout kinds Pronark understands. Must match the list in the database migration.
enum WorkoutKind {
    static func key(for type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: "running"
        case .walking, .hiking: "walking"
        case .cycling, .handCycling: "cycling"
        case .traditionalStrengthTraining, .functionalStrengthTraining, .coreTraining: "strength"
        case .highIntensityIntervalTraining, .mixedCardio: "hiit"
        case .yoga, .pilates: "yoga"
        case .swimming: "swimming"
        case .socialDance, .cardioDance: "dance"
        default: "other"
        }
    }
}
