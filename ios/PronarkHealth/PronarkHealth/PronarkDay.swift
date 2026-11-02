import Foundation

/// Pronark's days follow New York time, the same rule as the web app and the database
/// (`app.local_day`). Totals are grouped by New York days even when the phone is elsewhere.
enum PronarkDay {
    static let timeZone = TimeZone(identifier: "America/New_York")!
    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }()
    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    struct Day {
        let key: String   // "2026-07-15"
        let start: Date   // New York midnight
        let end: Date     // the next New York midnight (23 or 25 hours later on DST days)
    }

    static func key(for date: Date) -> String { formatter.string(from: date) }

    /// Every day from the 1st of this month through today. Only these days can still be checked
    /// off, so older data is never read or uploaded.
    static func thisMonth(now: Date = .now) -> [Day] {
        let today = calendar.startOfDay(for: now)
        guard var start = calendar.date(from: calendar.dateComponents([.year, .month], from: today)) else { return [] }
        var days: [Day] = []
        while start <= today, let end = calendar.date(byAdding: .day, value: 1, to: start) {
            days.append(Day(key: key(for: start), start: start, end: end))
            start = end
        }
        return days
    }
}
