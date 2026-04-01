import Foundation
import Dispatch
import EventKit
import CoreLocation
import CoreGraphics

// MARK: - Output Structures & JSON Models

struct StandardOutput<T: Codable>: Codable {
    let status = "success"
    let result: T
}

struct ErrorOutput: Codable {
    let status = "error"
    let message: String
}

struct ReadResult: Codable {
    let lists: [ListJSON]
    let reminders: [ReminderJSON]
}

struct DeleteResult: Codable {
    let id: String
    let deleted = true
}

struct DeleteListResult: Codable {
    let title: String
    let deleted = true
}

struct ReminderJSON: Codable {
    let id: String
    let title: String
    let isCompleted: Bool
    let list: String
    let notes: String?
    let url: String?
    let location: String?
    let timeZone: String?
    let dueDate: String?
    let startDate: String?
    let completionDate: String?
    let creationDate: String?
    let lastModifiedDate: String?
    let externalId: String?
    let priority: Int
    let alarms: [AlarmJSON]?
    let recurrenceRules: [RecurrenceRuleJSON]?
    let locationTrigger: LocationTriggerJSON?
}

struct StructuredLocationJSON: Codable {
    let title: String
    let latitude: Double?
    let longitude: Double?
    let radius: Double?
}

struct AlarmJSON: Codable {
    let relativeOffset: Double?
    let absoluteDate: String?
    let locationTrigger: LocationTriggerJSON?
    let alarmType: String?
}

struct ParticipantJSON: Codable {
    let name: String?
    let url: String
    let status: String?
    let role: String?
    let type: String?
    let isCurrentUser: Bool?
}

// MARK: - Location Trigger Models
struct LocationTriggerJSON: Codable {
    let title: String           // Location name/title
    let latitude: Double
    let longitude: Double
    let radius: Double          // Geofence radius in meters (default 100)
    let proximity: String       // "enter" or "leave"
}

private func parseLocationTrigger(from json: String) -> (EKStructuredLocation, EKAlarmProximity)? {
    guard let data = json.data(using: .utf8),
          let trigger = try? JSONDecoder().decode(LocationTriggerJSON.self, from: data) else {
        return nil
    }

    let structuredLocation = EKStructuredLocation(title: trigger.title)
    structuredLocation.geoLocation = CLLocation(latitude: trigger.latitude, longitude: trigger.longitude)
    structuredLocation.radius = trigger.radius > 0 ? trigger.radius : 100 // Default 100m radius

    let proximity: EKAlarmProximity
    switch trigger.proximity.lowercased() {
    case "leave", "depart", "exit":
        proximity = .leave
    default:
        proximity = .enter
    }

    return (structuredLocation, proximity)
}

private func locationTriggerToJSON(_ alarm: EKAlarm) -> LocationTriggerJSON? {
    guard let structuredLocation = alarm.structuredLocation,
          let geoLocation = structuredLocation.geoLocation else {
        return nil
    }

    let proximity: String
    switch alarm.proximity {
    case .enter: proximity = "enter"
    case .leave: proximity = "leave"
    default: proximity = "none"
    }

    return LocationTriggerJSON(
        title: structuredLocation.title ?? "Location",
        latitude: geoLocation.coordinate.latitude,
        longitude: geoLocation.coordinate.longitude,
        radius: structuredLocation.radius > 0 ? structuredLocation.radius : 100,
        proximity: proximity
    )
}

private func structuredLocationFromTrigger(_ trigger: LocationTriggerJSON) -> (EKStructuredLocation, EKAlarmProximity) {
    let structuredLocation = EKStructuredLocation(title: trigger.title)
    structuredLocation.geoLocation = CLLocation(latitude: trigger.latitude, longitude: trigger.longitude)
    structuredLocation.radius = trigger.radius > 0 ? trigger.radius : 100

    let proximity: EKAlarmProximity
    switch trigger.proximity.lowercased() {
    case "leave", "depart", "exit":
        proximity = .leave
    default:
        proximity = .enter
    }

    return (structuredLocation, proximity)
}

private func parseStructuredLocation(from json: String) -> EKStructuredLocation? {
    guard let data = json.data(using: .utf8),
          let location = try? JSONDecoder().decode(StructuredLocationJSON.self, from: data) else {
        return nil
    }

    let structuredLocation = EKStructuredLocation(title: location.title)
    if let lat = location.latitude, let lon = location.longitude {
        structuredLocation.geoLocation = CLLocation(latitude: lat, longitude: lon)
    }
    if let radius = location.radius, radius > 0 {
        structuredLocation.radius = radius
    }
    return structuredLocation
}

private func structuredLocationToJSON(_ structuredLocation: EKStructuredLocation?) -> StructuredLocationJSON? {
    guard let structuredLocation = structuredLocation else { return nil }
    let geo = structuredLocation.geoLocation
    return StructuredLocationJSON(
        title: structuredLocation.title ?? "Location",
        latitude: geo?.coordinate.latitude,
        longitude: geo?.coordinate.longitude,
        radius: structuredLocation.radius > 0 ? structuredLocation.radius : nil
    )
}

private func alarmToJSON(_ alarm: EKAlarm, preferredTimeZone: TimeZone) -> AlarmJSON {
    if let structured = locationTriggerToJSON(alarm) {
        let type = alarmTypeToString(alarm.type)
        return AlarmJSON(relativeOffset: nil, absoluteDate: nil, locationTrigger: structured, alarmType: type)
    }

    if let absolute = alarm.absoluteDate {
        let type = alarmTypeToString(alarm.type)
        return AlarmJSON(
            relativeOffset: nil,
            absoluteDate: formatEventDate(absolute, preferredTimeZone: preferredTimeZone, includeTime: true),
            locationTrigger: nil,
            alarmType: type
        )
    }

    let type = alarmTypeToString(alarm.type)
    return AlarmJSON(relativeOffset: alarm.relativeOffset, absoluteDate: nil, locationTrigger: nil, alarmType: type)
}

private func alarmTypeToString(_ type: EKAlarmType) -> String? {
    switch type {
    case .display: return "display"
    case .audio: return "audio"
    case .procedure: return "procedure"
    case .email: return "email"
    @unknown default: return nil
    }
}

private func parseAlarms(from json: String, dateParser: (String) -> Date?) -> [EKAlarm]? {
    guard let data = json.data(using: .utf8),
          let alarms = try? JSONDecoder().decode([AlarmJSON].self, from: data) else {
        return nil
    }

    var result: [EKAlarm] = []
    for alarmJSON in alarms {
        if let trigger = alarmJSON.locationTrigger {
            let (structuredLocation, proximity) = structuredLocationFromTrigger(trigger)
            let alarm = EKAlarm()
            alarm.structuredLocation = structuredLocation
            alarm.proximity = proximity
            result.append(alarm)
            continue
        }

        if let absoluteDateStr = alarmJSON.absoluteDate,
           let date = dateParser(absoluteDateStr) {
            let alarm = EKAlarm()
            alarm.absoluteDate = date
            result.append(alarm)
            continue
        }

        if let offset = alarmJSON.relativeOffset {
            let alarm = EKAlarm()
            alarm.relativeOffset = offset
            result.append(alarm)
            continue
        }
    }

    return result
}

// MARK: - Recurrence Rule Models
struct RecurrenceRuleJSON: Codable {
    let frequency: String  // daily, weekly, monthly, yearly
    let interval: Int
    let endDate: String?
    let occurrenceCount: Int?
    let daysOfWeek: [Int]?     // 1 = Sunday, 7 = Saturday
    let daysOfMonth: [Int]?    // 1-31
    let monthsOfYear: [Int]?   // 1-12
}

private func recurrenceRuleFromJSON(_ rule: RecurrenceRuleJSON) -> EKRecurrenceRule? {
    let frequency: EKRecurrenceFrequency
    switch rule.frequency.lowercased() {
    case "daily": frequency = .daily
    case "weekly": frequency = .weekly
    case "monthly": frequency = .monthly
    case "yearly": frequency = .yearly
    default: return nil
    }

    // Build days of week
    var ekDaysOfWeek: [EKRecurrenceDayOfWeek]?
    if let days = rule.daysOfWeek {
        ekDaysOfWeek = days.compactMap { day -> EKRecurrenceDayOfWeek? in
            guard let weekday = EKWeekday(rawValue: day) else { return nil }
            return EKRecurrenceDayOfWeek(weekday)
        }
    }

    // Build days of month
    var ekDaysOfMonth: [NSNumber]?
    if let days = rule.daysOfMonth {
        ekDaysOfMonth = days.map { NSNumber(value: $0) }
    }

    // Build months of year
    var ekMonthsOfYear: [NSNumber]?
    if let months = rule.monthsOfYear {
        ekMonthsOfYear = months.map { NSNumber(value: $0) }
    }

    // Build recurrence end
    var recurrenceEnd: EKRecurrenceEnd?
    if let endDateStr = rule.endDate, let endDate = parseDate(from: endDateStr) {
        recurrenceEnd = EKRecurrenceEnd(end: endDate)
    } else if let count = rule.occurrenceCount, count > 0 {
        recurrenceEnd = EKRecurrenceEnd(occurrenceCount: count)
    }

    return EKRecurrenceRule(
        recurrenceWith: frequency,
        interval: rule.interval,
        daysOfTheWeek: ekDaysOfWeek,
        daysOfTheMonth: ekDaysOfMonth,
        monthsOfTheYear: ekMonthsOfYear,
        weeksOfTheYear: nil,
        daysOfTheYear: nil,
        setPositions: nil,
        end: recurrenceEnd
    )
}

private func parseRecurrenceRule(from json: String) -> EKRecurrenceRule? {
    guard let data = json.data(using: .utf8),
          let rule = try? JSONDecoder().decode(RecurrenceRuleJSON.self, from: data) else {
        return nil
    }
    return recurrenceRuleFromJSON(rule)
}

private func parseRecurrenceRules(from json: String) -> [EKRecurrenceRule]? {
    guard let data = json.data(using: .utf8) else { return nil }

    if let rules = try? JSONDecoder().decode([RecurrenceRuleJSON].self, from: data) {
        return rules.compactMap { recurrenceRuleFromJSON($0) }
    }

    if let rule = try? JSONDecoder().decode(RecurrenceRuleJSON.self, from: data),
       let ek = recurrenceRuleFromJSON(rule) {
        return [ek]
    }

    return nil
}

private func recurrenceRuleToJSON(_ ekRule: EKRecurrenceRule) -> RecurrenceRuleJSON? {
    let frequency: String
    switch ekRule.frequency {
    case .daily: frequency = "daily"
    case .weekly: frequency = "weekly"
    case .monthly: frequency = "monthly"
    case .yearly: frequency = "yearly"
    @unknown default: return nil
    }

    let daysOfWeek = ekRule.daysOfTheWeek?.map { $0.dayOfTheWeek.rawValue }
    let daysOfMonth = ekRule.daysOfTheMonth?.map { $0.intValue }
    let monthsOfYear = ekRule.monthsOfTheYear?.map { $0.intValue }

    var endDateStr: String?
    if let endDate = ekRule.recurrenceEnd?.endDate {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        endDateStr = formatter.string(from: endDate)
    }

    let occurrenceCount = ekRule.recurrenceEnd?.occurrenceCount

    return RecurrenceRuleJSON(
        frequency: frequency,
        interval: ekRule.interval,
        endDate: endDateStr,
        occurrenceCount: (occurrenceCount != nil && occurrenceCount! > 0) ? occurrenceCount : nil,
        daysOfWeek: daysOfWeek,
        daysOfMonth: daysOfMonth,
        monthsOfYear: monthsOfYear
    )
}

private func parseDate(from dateString: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: dateString) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    if let date = formatter.date(from: dateString) { return date }

    let basicFormatter = DateFormatter()
    basicFormatter.locale = Locale(identifier: "en_US_POSIX")
    basicFormatter.dateFormat = "yyyy-MM-dd"
    return basicFormatter.date(from: dateString)
}
struct ListJSON: Codable {
    let id: String
    let title: String
    let color: String? // Hex color code
}

struct EventJSON: Codable {
    let id: String
    let title: String
    let calendar: String
    let startDate: String
    let endDate: String
    let notes: String?
    let location: String?
    let structuredLocation: StructuredLocationJSON?
    let url: String?
    let isAllDay: Bool
    let availability: String?
    let alarms: [AlarmJSON]?
    let recurrenceRules: [RecurrenceRuleJSON]?
    let organizer: ParticipantJSON?
    let attendees: [ParticipantJSON]?
    let status: String?
    let isDetached: Bool?
    let occurrenceDate: String?
    let creationDate: String?
    let lastModifiedDate: String?
    let externalId: String?
}

struct CalendarJSON: Codable {
    let id: String
    let title: String
    let account: String
    let accountType: String
}

struct EventsReadResult: Codable {
    let calendars: [CalendarJSON]
    let events: [EventJSON]
}

// MARK: - Date Parsing Helper (Robust Implementation)
private struct ExplicitTimezone {
    let suffix: String
    let timeZone: TimeZone
}

private func detectExplicitTimezone(in dateString: String) -> ExplicitTimezone? {
    let trimmed = dateString.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasSuffix("Z") {
        guard let tz = TimeZone(secondsFromGMT: 0) else { return nil }
        return ExplicitTimezone(suffix: "Z", timeZone: tz)
    }

    let pattern = #"[+-]\d{2}:\d{2}$|[+-]\d{4}$|[+-]\d{2}$"#
    guard let range = trimmed.range(of: pattern, options: .regularExpression) else {
        return nil
    }

    let suffix = String(trimmed[range])
    let sign: Int = suffix.first == "-" ? -1 : 1
    let numeric = suffix.dropFirst()

    let components: (hours: Int, minutes: Int)? = {
        if suffix.contains(":") {
            let parts = numeric.split(separator: ":")
            guard parts.count == 2,
                  let hourValue = Int(parts[0]),
                  let minuteValue = Int(parts[1]) else { return nil }
            return (hourValue, minuteValue)
        }
        if numeric.count == 4 {
            let hoursPart = numeric.prefix(2)
            let minutesPart = numeric.suffix(2)
            guard let hourValue = Int(hoursPart),
                  let minuteValue = Int(minutesPart) else { return nil }
            return (hourValue, minuteValue)
        }
        if numeric.count == 2, let hourValue = Int(numeric) {
            return (hourValue, 0)
        }
        return nil
    }()

    guard let offset = components else { return nil }
    let totalSeconds = sign * ((offset.hours * 60 + offset.minutes) * 60)
    guard let timeZone = TimeZone(secondsFromGMT: totalSeconds) else { return nil }
    return ExplicitTimezone(suffix: suffix, timeZone: timeZone)
}

private func formatterWithBaseLocale() -> DateFormatter {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    return formatter
}

private func normalizedComponents(_ components: inout DateComponents, using calendar: Calendar, timeZone: TimeZone) {
    components.calendar = calendar
    components.timeZone = timeZone
    if components.second == nil && components.hour != nil { components.second = 0 }
    if components.nanosecond != nil { components.nanosecond = 0 }
}

private func componentsSet(for input: String) -> Set<Calendar.Component> {
    if input.contains(":") || input.contains("T") {
        return [.year, .month, .day, .hour, .minute, .second]
    }
    return [.year, .month, .day]
}

private func parseDateComponents(from dateString: String) -> DateComponents? {
    let trimmedInput = dateString.trimmingCharacters(in: .whitespacesAndNewlines)

    if let tzInfo = detectExplicitTimezone(in: trimmedInput) {
        let formatter = formatterWithBaseLocale()
        formatter.timeZone = tzInfo.timeZone

        let formatsWithTimezone = [
            // Formats with colon timezone offsets (ZZZZZ, ZZZ)
            "yyyy-MM-dd'T'HH:mm:ss.SSSZZZZZ",
            "yyyy-MM-dd HH:mm:ss.SSSZZZZZ",
            "yyyy-MM-dd'T'HH:mm:ssZZZZZ",
            "yyyy-MM-dd HH:mm:ssZZZZZ",
            "yyyy-MM-dd'T'HH:mmZZZZZ",
            "yyyy-MM-dd HH:mmZZZZZ",
            "yyyy-MM-ddZZZZZ",
            "yyyy-MM-dd'T'HH:mm:ss.SSSZZZ",
            "yyyy-MM-dd HH:mm:ss.SSSZZZ",
            "yyyy-MM-dd'T'HH:mm:ssZZZ",
            "yyyy-MM-dd HH:mm:ssZZZ",
            "yyyy-MM-dd'T'HH:mmZZZ",
            "yyyy-MM-dd HH:mmZZZ",
            "yyyy-MM-ddZZZ",
            // Formats with colonless timezone offsets (Z, ZZ) - supports +0200, +02
            "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
            "yyyy-MM-dd HH:mm:ss.SSSZ",
            "yyyy-MM-dd'T'HH:mm:ssZ",
            "yyyy-MM-dd HH:mm:ssZ",
            "yyyy-MM-dd'T'HH:mmZ",
            "yyyy-MM-dd HH:mmZ",
            "yyyy-MM-ddZ"
        ]

        for format in formatsWithTimezone {
            formatter.dateFormat = format
            if let parsedDate = formatter.date(from: trimmedInput) {
                var calendar = Calendar(identifier: .gregorian)
                calendar.timeZone = tzInfo.timeZone
                var components = calendar.dateComponents(componentsSet(for: trimmedInput), from: parsedDate)
                normalizedComponents(&components, using: calendar, timeZone: tzInfo.timeZone)
                return components
            }
        }
    }

    let formatter = formatterWithBaseLocale()
    formatter.timeZone = TimeZone.current

    let localFormats = [
        "yyyy-MM-dd'T'HH:mm:ss.SSS",
        "yyyy-MM-dd HH:mm:ss.SSS",
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd HH:mm:ss",
        "yyyy-MM-dd'T'HH:mm",
        "yyyy-MM-dd HH:mm",
        "yyyy-MM-dd"
    ]

    for format in localFormats {
        formatter.dateFormat = format
        if let parsedDate = formatter.date(from: trimmedInput) {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone.current
            var components = calendar.dateComponents(componentsSet(for: trimmedInput), from: parsedDate)
            normalizedComponents(&components, using: calendar, timeZone: TimeZone.current)
            return components
        }
    }

    return nil
}

// MARK: - RemindersManager Class
class RemindersManager {
    private let eventStore = EKEventStore()

    // MARK: - Permission Status Checking (Best Practice)
    func checkRemindersAuthorizationStatus() -> EKAuthorizationStatus {
        return EKEventStore.authorizationStatus(for: .reminder)
    }
    
    func checkCalendarAuthorizationStatus() -> EKAuthorizationStatus {
        return EKEventStore.authorizationStatus(for: .event)
    }

    func requestAccess(completion: @escaping (Bool, Error?) -> Void) {
        if #available(macOS 26.0, *) {
            Task { @MainActor in
                do {
                    let granted = try await eventStore.requestFullAccessToReminders()
                    completion(granted, nil)
                } catch {
                    completion(false, error)
                }
            }
        } else if #available(macOS 14.0, *) {
            eventStore.requestFullAccessToReminders(completion: completion)
        } else {
            eventStore.requestAccess(to: .reminder, completion: completion)
        }
    }

    func requestCalendarAccess(completion: @escaping (Bool, Error?) -> Void) {
        if #available(macOS 26.0, *) {
            Task { @MainActor in
                do {
                    let granted = try await eventStore.requestFullAccessToEvents()
                    completion(granted, nil)
                } catch {
                    completion(false, error)
                }
            }
        } else if #available(macOS 14.0, *) {
            eventStore.requestFullAccessToEvents(completion: completion)
        } else {
            eventStore.requestAccess(to: .event, completion: completion)
        }
    }
    
    private func findReminder(withId id: String) -> EKReminder? { eventStore.calendarItem(withIdentifier: id) as? EKReminder }

    func getReminderById(id: String) throws -> ReminderJSON {
        guard let reminder = findReminder(withId: id) else {
            throw NSError(domain: "", code: 404, userInfo: [NSLocalizedDescriptionKey: "Reminder with ID '\(id)' not found."])
        }
        return reminder.toJSON()
    }

    private func findList(named name: String?) throws -> EKCalendar {
        guard let listName = name, !listName.isEmpty else { return eventStore.defaultCalendarForNewReminders()! }
        guard let list = eventStore.calendars(for: .reminder).first(where: { $0.title == listName }) else {
            throw NSError(domain: "", code: 404, userInfo: [NSLocalizedDescriptionKey: "List '\(listName)' not found."])
        }
        return list
    }

    // MARK: Actions
    func getLists() -> [ListJSON] {
        return eventStore.calendars(for: .reminder).map { $0.toJSON() }
    }

    func getReminders(showCompleted: Bool, filterList: String?, search: String?, dueWithin: String?) throws -> [ReminderJSON] {
        let predicate = eventStore.predicateForReminders(in: nil)
        let semaphore = DispatchSemaphore(value: 0)
        var fetchedReminders: [EKReminder]?
        eventStore.fetchReminders(matching: predicate) { reminders in fetchedReminders = reminders; semaphore.signal() }
        semaphore.wait()
        
        guard let reminders = fetchedReminders else { return [] }
        
        var filtered = reminders
        if !showCompleted { filtered = filtered.filter { !$0.isCompleted } }
        if let listName = filterList { filtered = filtered.filter { $0.calendar.title == listName } }
        if let searchTerm = search?.lowercased() { 
            filtered = filtered.filter { 
                $0.title.lowercased().contains(searchTerm) || ($0.notes?.lowercased().contains(searchTerm) ?? false)
            }
        }
        if let dueFilter = dueWithin {
            let now = Date()
            let todayStart = Calendar.current.startOfDay(for: now)
            filtered = filtered.filter { reminder in
                guard let dueDateComponents = reminder.dueDateComponents,
                      let dueDate = Calendar.current.date(from: dueDateComponents) else {
                    return dueFilter == "no-date"
                }
                if dueFilter == "overdue" { return dueDate < todayStart }
                if dueFilter == "today" { return Calendar.current.isDateInToday(dueDate) }
                if dueFilter == "tomorrow" { return Calendar.current.isDateInTomorrow(dueDate) }
                if dueFilter == "this-week" {
                    guard let weekInterval = Calendar.current.dateInterval(of: .weekOfYear, for: now) else { return false }
                    return weekInterval.contains(dueDate)
                }
                return false
            }
        }
        return filtered.map { $0.toJSON() }
    }

    func createReminder(title: String, listName: String?, notes: String?, location: String?, urlString: String?, startDateString: String?, dueDateString: String?, priority: Int?, alarmsJSON: String?, recurrenceRulesJSON: String?, locationTriggerJSON: String?, isCompleted: Bool?) throws -> ReminderJSON {
        let reminder = EKReminder(eventStore: eventStore)
        reminder.calendar = try findList(named: listName)
        reminder.title = title

        if let isCompleted = isCompleted { reminder.isCompleted = isCompleted }
        if let location = location {
            reminder.location = location.isEmpty ? nil : location
        }

        // Set priority (0=none, 1=high, 5=medium, 9=low)
        if let p = priority {
            reminder.priority = p
        }

        // Set recurrence rules
        if let recJSON = recurrenceRulesJSON, let rules = parseRecurrenceRules(from: recJSON) {
            for rule in rules {
                reminder.addRecurrenceRule(rule)
            }
        }

        // Handle URL: store in both URL field and append to notes
        var finalNotes = notes
        if let urlStr = urlString, !urlStr.isEmpty, let url = URL(string: urlStr) {
            reminder.url = url
            // Append URL to notes only if it doesn't already exist
            let urlInNotes = notes?.contains(urlStr) ?? false
            if !urlInNotes {
                if let existingNotes = notes, !existingNotes.isEmpty {
                    finalNotes = existingNotes + "\n\nURLs:\n- " + urlStr
                } else {
                    finalNotes = "URLs:\n- " + urlStr
                }
            }
        }
        if let finalNotes = finalNotes { reminder.notes = finalNotes }

        var startTz: TimeZone?
        if let startStr = startDateString {
            if let parsedComponents = parseDateComponents(from: startStr) {
                reminder.startDateComponents = parsedComponents
                startTz = parsedComponents.timeZone
            } else {
                reminder.startDateComponents = nil
            }
        }

        var dueTz: TimeZone?
        if let dateStr = dueDateString {
            if let parsedComponents = parseDateComponents(from: dateStr) {
                reminder.dueDateComponents = parsedComponents
                dueTz = parsedComponents.timeZone
            } else {
                reminder.dueDateComponents = nil
            }
        }

        if let startTz = startTz, let dueTz = dueTz, startTz.identifier != dueTz.identifier {
            throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "Reminder start and due dates have different timezones (\(startTz.identifier) vs \(dueTz.identifier)). EventKit reminders support only one timezone. Please use the same timezone for both."])
        }
        reminder.timeZone = startTz ?? dueTz

        // Set alarms
        if let alarmsJSON = alarmsJSON, let alarms = parseAlarms(from: alarmsJSON, dateParser: self.parseDate(from:)) {
            for alarm in alarms {
                reminder.addAlarm(alarm)
            }
        } else if let locJSON = locationTriggerJSON, let trigger = try? JSONDecoder().decode(LocationTriggerJSON.self, from: Data(locJSON.utf8)) {
            // Back-compat: single location trigger
            let (structuredLocation, proximity) = structuredLocationFromTrigger(trigger)
            let alarm = EKAlarm()
            alarm.structuredLocation = structuredLocation
            alarm.proximity = proximity
            reminder.addAlarm(alarm)
        }

        try eventStore.save(reminder, commit: true)
        return reminder.toJSON()
    }

    func updateReminder(id: String, newTitle: String?, listName: String?, notes: String?, location: String?, urlString: String?, isCompleted: Bool?, completionDateString: String?, startDateString: String?, dueDateString: String?, priority: Int?, alarmsJSON: String?, clearAlarms: Bool?, recurrenceRulesJSON: String?, clearRecurrence: Bool?, locationTriggerJSON: String?, clearLocationTrigger: Bool?) throws -> ReminderJSON {
        guard let reminder = findReminder(withId: id) else { throw NSError(domain: "", code: 404, userInfo: [NSLocalizedDescriptionKey: "ID '\(id)' not found."]) }
        if let newTitle = newTitle { reminder.title = newTitle }
        if let location = location {
            reminder.location = location.isEmpty ? nil : location
        }

        // Handle URL: store in both URL field and append to notes
        var finalNotes: String?

        if let urlStr = urlString, !urlStr.isEmpty, let url = URL(string: urlStr) {
            reminder.url = url  // Store single URL in URL field
            // If new notes provided and doesn't contain URL, append URL to new notes
            if let newNotes = notes {
                let urlInNewNotes = newNotes.contains(urlStr)
                if !urlInNewNotes {
                    // Append URL to new notes
                    finalNotes = newNotes.isEmpty ? "URLs:\n- " + urlStr : newNotes + "\n\nURLs:\n- " + urlStr
                } else {
                    finalNotes = newNotes
                }
            } else {
                // No new notes provided, check if URL exists in existing notes
                let urlInOriginalNotes = reminder.notes?.contains(urlStr) ?? false
                if !urlInOriginalNotes {
                    if let existingNotes = reminder.notes, !existingNotes.isEmpty {
                        finalNotes = existingNotes + "\n\nURLs:\n- " + urlStr
                    } else {
                        finalNotes = "URLs:\n- " + urlStr
                    }
                } else {
                    finalNotes = reminder.notes
                }
            }
        } else if let newNotes = notes {
            // No URL provided but new notes provided
            finalNotes = newNotes
        } else {
            // No URL and no new notes, keep existing notes
            finalNotes = reminder.notes
        }

        if let finalNotes = finalNotes { reminder.notes = finalNotes }

        if let completionDateStr = completionDateString, let parsed = parseDate(from: completionDateStr) {
            reminder.completionDate = parsed
        } else if completionDateString != nil {
            throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid completionDate format."])
        }

        if let isCompleted = isCompleted { reminder.isCompleted = isCompleted }

        // Update priority (0=none, 1=high, 5=medium, 9=low)
        if let p = priority {
            reminder.priority = p
        }

        // Update recurrence rules
        if clearRecurrence == true {
            if let rules = reminder.recurrenceRules {
                for rule in rules { reminder.removeRecurrenceRule(rule) }
            }
        } else if let recJSON = recurrenceRulesJSON, let newRules = parseRecurrenceRules(from: recJSON) {
            if let rules = reminder.recurrenceRules {
                for rule in rules { reminder.removeRecurrenceRule(rule) }
            }
            for rule in newRules { reminder.addRecurrenceRule(rule) }
        }

        // Update alarms
        if clearAlarms == true {
            if let alarms = reminder.alarms {
                for alarm in alarms { reminder.removeAlarm(alarm) }
            }
        } else if let alarmsJSON = alarmsJSON, let alarms = parseAlarms(from: alarmsJSON, dateParser: self.parseDate(from:)) {
            if let existing = reminder.alarms {
                for alarm in existing { reminder.removeAlarm(alarm) }
            }
            for alarm in alarms { reminder.addAlarm(alarm) }
        }

        // Update location trigger
        if clearLocationTrigger == true {
            // Remove all location-based alarms
            if let alarms = reminder.alarms {
                for alarm in alarms where alarm.structuredLocation != nil {
                    reminder.removeAlarm(alarm)
                }
            }
        } else if let locJSON = locationTriggerJSON, let (structuredLocation, proximity) = parseLocationTrigger(from: locJSON) {
            // Remove existing location alarms and add new one
            if let alarms = reminder.alarms {
                for alarm in alarms where alarm.structuredLocation != nil {
                    reminder.removeAlarm(alarm)
                }
            }
            let alarm = EKAlarm()
            alarm.structuredLocation = structuredLocation
            alarm.proximity = proximity
            reminder.addAlarm(alarm)
        }

        if let listName = listName { reminder.calendar = try findList(named: listName) }

        var startTz: TimeZone?
        if let startStr = startDateString {
            if let parsedComponents = parseDateComponents(from: startStr) {
                reminder.startDateComponents = parsedComponents
                startTz = parsedComponents.timeZone
            } else {
                reminder.startDateComponents = nil
            }
        }

        var dueTz: TimeZone?
        if let dateStr = dueDateString {
            if let parsedComponents = parseDateComponents(from: dateStr) {
                reminder.dueDateComponents = parsedComponents
                dueTz = parsedComponents.timeZone
            } else {
                reminder.dueDateComponents = nil
            }
        }

        if let startTz = startTz, let dueTz = dueTz, startTz.identifier != dueTz.identifier {
            throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "Reminder start and due dates have different timezones (\(startTz.identifier) vs \(dueTz.identifier)). EventKit reminders support only one timezone. Please use the same timezone for both."])
        }
        if startTz != nil || dueTz != nil {
            reminder.timeZone = startTz ?? dueTz
        }

        try eventStore.save(reminder, commit: true)
        return reminder.toJSON()
    }

    func deleteReminder(id: String) throws {
        guard let reminder = findReminder(withId: id) else {
            throw NSError(domain: "", code: 404, userInfo: [NSLocalizedDescriptionKey: "Reminder with ID '\(id)' not found."])
        }
        try eventStore.remove(reminder, commit: true)
    }
    func createList(title: String, color: String?) throws -> ListJSON {
        let list = EKCalendar(for: .reminder, eventStore: eventStore)
        list.title = title

        // Set calendar source to avoid "Calendar has no source" error
        // Try in order: default reminders calendar source, calDAV source, or local source
        if let defaultReminderCalendar = eventStore.defaultCalendarForNewReminders() {
            list.source = defaultReminderCalendar.source
        } else if let caldavSource = eventStore.sources.first(where: { $0.sourceType == .calDAV }) {
            list.source = caldavSource
        } else if let localSource = eventStore.sources.first(where: { $0.sourceType == .local }) {
            list.source = localSource
        } else {
            throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "No calendar source available. Please ensure at least one reminders source exists."])
        }

        // Set color if provided
        if let colorHex = color, let cgColor = CGColor.fromHex(colorHex) {
            list.cgColor = cgColor
        }

        try eventStore.saveCalendar(list, commit: true)
        return list.toJSON()
    }

    func updateList(currentName: String, newName: String?, color: String?) throws -> ListJSON {
        let list = try findList(named: currentName)
        if let newName = newName, !newName.isEmpty {
            list.title = newName
        }

        // Set color if provided
        if let colorHex = color, let cgColor = CGColor.fromHex(colorHex) {
            list.cgColor = cgColor
        }

        try eventStore.saveCalendar(list, commit: true)
        return list.toJSON()
    }

    func deleteList(title: String) throws {
        try eventStore.removeCalendar(try findList(named: title), commit: true)
    }
    
    // MARK: Calendar Events Management
    private func findCalendar(named name: String?) throws -> EKCalendar {
        guard let calName = name, !calName.isEmpty else {
            guard let defaultCal = eventStore.defaultCalendarForNewEvents else {
                throw NSError(domain: "", code: 404, userInfo: [NSLocalizedDescriptionKey: "No default calendar available."])
            }
            return defaultCal
        }
        guard let calendar = eventStore.calendars(for: .event).first(where: { $0.title == calName }) else {
            throw NSError(domain: "", code: 404, userInfo: [NSLocalizedDescriptionKey: "Calendar '\(calName)' not found."])
        }
        return calendar
    }
    
    func getCalendars() -> [CalendarJSON] {
        return eventStore.calendars(for: .event).map { $0.toCalendarJSON() }
    }
    
    func getEvents(startDate: Date?, endDate: Date?, calendarName: String?, search: String?, availability: String?, accountName: String?) throws -> [EventJSON] {
        var calendars = calendarName != nil ? [try findCalendar(named: calendarName)] : eventStore.calendars(for: .event)
        if let account = accountName {
            let accountExists = eventStore.sources.contains { $0.title == account }
            if !accountExists {
                let available = eventStore.sources.map { $0.title }.joined(separator: ", ")
                throw NSError(domain: "EventKitCLI", code: 1, userInfo: [NSLocalizedDescriptionKey: "Account '\(account)' not found. Available accounts: \(available)"])
            }
            calendars = calendars.filter { $0.source.title == account }
        }
        let predicate = eventStore.predicateForEvents(withStart: startDate ?? Date.distantPast, end: endDate ?? Date.distantFuture, calendars: calendars)
        
        let events = eventStore.events(matching: predicate)
        var filtered = events
        
        if let searchTerm = search?.lowercased() {
            filtered = filtered.filter {
                $0.title.lowercased().contains(searchTerm) || 
                ($0.notes?.lowercased().contains(searchTerm) ?? false) ||
                ($0.location?.lowercased().contains(searchTerm) ?? false)
            }
        }

        if let availability = availability {
            filtered = filtered.filter { eventAvailabilityToString($0.availability) == availability }
        }
        
        return filtered.map { $0.toJSON() }
    }
    
    func createEvent(title: String, calendarName: String?, startDateString: String, endDateString: String, notes: String?, location: String?, structuredLocationJSON: String?, urlString: String?, isAllDay: Bool?, availability: String?, alarmsJSON: String?, recurrenceRulesJSON: String?) throws -> EventJSON {
        let event = EKEvent(eventStore: eventStore)
        event.calendar = try findCalendar(named: calendarName)
        event.title = title
        
        guard let startDate = parseDate(from: startDateString),
              let endDate = parseDate(from: endDateString) else {
            throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid date format. Use 'YYYY-MM-DD HH:mm:ss' or ISO 8601 format."])
        }
        
        if let startComponents = parseDateComponents(from: startDateString) {
            event.timeZone = startComponents.timeZone
        }
        
        event.startDate = startDate
        event.endDate = endDate
        event.isAllDay = isAllDay ?? false
        
        if let notesStr = notes { event.notes = notesStr }
        if let locationStr = location { event.location = locationStr }
        if let structuredLocationJSON = structuredLocationJSON,
           let structured = parseStructuredLocation(from: structuredLocationJSON) {
            event.structuredLocation = structured
        }
        if let urlStr = urlString, !urlStr.isEmpty, let url = URL(string: urlStr) {
            event.url = url
        }
        if let availability = availability {
            switch availability.lowercased() {
            case "busy":
                event.availability = .busy
            case "free":
                event.availability = .free
            case "tentative":
                event.availability = .tentative
            case "unavailable":
                event.availability = .unavailable
            default:
                break
            }
        }

        if let alarmsJSON = alarmsJSON, let alarms = parseAlarms(from: alarmsJSON, dateParser: self.parseDate(from:)) {
            event.alarms = alarms
        }

        if let recurrenceRulesJSON = recurrenceRulesJSON, let rules = parseRecurrenceRules(from: recurrenceRulesJSON) {
            event.recurrenceRules = rules
        }
        
        do {
            try eventStore.save(event, span: .thisEvent, commit: true)
        } catch {
            // Provide detailed error information without permission hints
            // Permission is already checked before this operation
            let errorMsg = error.localizedDescription
            throw NSError(domain: "", code: 500, userInfo: [NSLocalizedDescriptionKey: "Failed to save calendar event: \(errorMsg)"])
        }
        return event.toJSON()
    }
    
    private func findEvent(withId id: String) -> EKEvent? {
        return eventStore.event(withIdentifier: id)
    }
    
    func updateEvent(id: String, title: String?, calendarName: String?, startDateString: String?, endDateString: String?, notes: String?, location: String?, structuredLocationJSON: String?, urlString: String?, isAllDay: Bool?, availability: String?, alarmsJSON: String?, clearAlarms: Bool?, recurrenceRulesJSON: String?, clearRecurrence: Bool?, span: String?) throws -> EventJSON {
        guard let event = findEvent(withId: id) else {
            throw NSError(domain: "", code: 404, userInfo: [NSLocalizedDescriptionKey: "Event with ID '\(id)' not found."])
        }
        
        if let newTitle = title { event.title = newTitle }
        if let newCalendar = calendarName { event.calendar = try findCalendar(named: newCalendar) }
        
        if let startStr = startDateString {
            guard let startDate = parseDate(from: startStr) else {
                throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid start date format."])
            }
            // Update timezone from start date components if provided
            if let startComponents = parseDateComponents(from: startStr) {
                event.timeZone = startComponents.timeZone
            }
            event.startDate = startDate
        }
        
        if let endStr = endDateString {
            guard let endDate = parseDate(from: endStr) else {
                throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid end date format."])
            }
            event.endDate = endDate
            
            // Handle end date timezone - EventKit only supports one timezone per event
            if let endComponents = parseDateComponents(from: endStr), let endTz = endComponents.timeZone {
                if let existingTz = event.timeZone {
                    // If start date was provided in this update with a different timezone, reject the conflicting timezones
                    if startDateString != nil && existingTz.identifier != endTz.identifier {
                        throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "Event start and end dates have different timezones (\(existingTz.identifier) vs \(endTz.identifier)). EventKit events support only one timezone per event. Please use the same timezone for both dates."])
                    }
                } else {
                    // If timezone not set from startDate, use endDate timezone
                    event.timeZone = endTz
                }
            }
        }
        
        if let notesStr = notes { event.notes = notesStr }
        if let locationStr = location { event.location = locationStr }
        if let structuredLocationJSON = structuredLocationJSON {
            if structuredLocationJSON.isEmpty {
                event.structuredLocation = nil
            } else if let structured = parseStructuredLocation(from: structuredLocationJSON) {
                event.structuredLocation = structured
            }
        }
        if let urlStr = urlString {
            if urlStr.isEmpty {
                event.url = nil
            } else if let url = URL(string: urlStr) {
                event.url = url
            }
        }
        if let allDay = isAllDay { event.isAllDay = allDay }

        if let availability = availability {
            switch availability.lowercased() {
            case "busy":
                event.availability = .busy
            case "free":
                event.availability = .free
            case "tentative":
                event.availability = .tentative
            case "unavailable":
                event.availability = .unavailable
            default:
                break
            }
        }

        if clearAlarms == true {
            event.alarms = []
        } else if let alarmsJSON = alarmsJSON, let alarms = parseAlarms(from: alarmsJSON, dateParser: self.parseDate(from:)) {
            event.alarms = alarms
        }

        if clearRecurrence == true {
            event.recurrenceRules = []
        } else if let recurrenceRulesJSON = recurrenceRulesJSON, let rules = parseRecurrenceRules(from: recurrenceRulesJSON) {
            event.recurrenceRules = rules
        }

        let saveSpan: EKSpan = (span?.lowercased() == "future-events") ? .futureEvents : .thisEvent
        
        try eventStore.save(event, span: saveSpan, commit: true)
        return event.toJSON()
    }
    
    func deleteEvent(id: String, span: String?) throws {
        guard let event = findEvent(withId: id) else {
            throw NSError(domain: "", code: 404, userInfo: [NSLocalizedDescriptionKey: "Event with ID '\(id)' not found."])
        }
        let removeSpan: EKSpan = (span?.lowercased() == "future-events") ? .futureEvents : .thisEvent
        try eventStore.remove(event, span: removeSpan, commit: true)
    }
    
    func parseDate(from dateString: String) -> Date? {
        guard var components = parseDateComponents(from: dateString) else { return nil }
        let calendar: Calendar = {
            if let existing = components.calendar { return existing }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = components.timeZone ?? TimeZone.current
            return calendar
        }()
        components.calendar = calendar
        components.timeZone = components.timeZone ?? calendar.timeZone
        return calendar.date(from: components)
    }
}

// MARK: - Date Formatting Helper
private func formatDueDateWithTimezone(from dateComponents: DateComponents?, timeZoneHint: TimeZone?) -> String? {
    guard var components = dateComponents else {
        return nil
    }

    let timeZone = components.timeZone
        ?? timeZoneHint
        ?? components.calendar?.timeZone
        ?? TimeZone.current
    var calendar = components.calendar ?? Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone

    components.calendar = calendar
    components.timeZone = timeZone
    guard let date = calendar.date(from: components) else { return nil }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = timeZone
    formatter.calendar = calendar

    if components.hour != nil {
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZZZZZ"
    } else {
        formatter.dateFormat = "yyyy-MM-ddZZZZZ"
    }

    return formatter.string(from: date)
}

// MARK: - Extensions & Main
extension EKReminder {
    func toJSON() -> ReminderJSON {
        let preferredTimeZone = self.timeZone ?? TimeZone.current

        let recurrenceRules: [RecurrenceRuleJSON]? = {
            guard let rules = self.recurrenceRules else { return nil }
            let mapped = rules.compactMap { recurrenceRuleToJSON($0) }
            return mapped.isEmpty ? nil : mapped
        }()

        let alarms: [AlarmJSON]? = {
            guard let alarms = self.alarms else { return nil }
            let mapped = alarms.map { alarmToJSON($0, preferredTimeZone: preferredTimeZone) }
            return mapped.isEmpty ? nil : mapped
        }()

        // Convenience: first location-based alarm if any
        let locationTrigger: LocationTriggerJSON? = {
            guard let alarms = self.alarms else { return nil }
            for alarm in alarms {
                if let trigger = locationTriggerToJSON(alarm) {
                    return trigger
                }
            }
            return nil
        }()

        return ReminderJSON(
            id: self.calendarItemIdentifier,
            title: self.title,
            isCompleted: self.isCompleted,
            list: self.calendar.title,
            notes: self.notes,
            url: self.url?.absoluteString,
            location: self.location,
            timeZone: self.timeZone?.identifier,
            dueDate: formatDueDateWithTimezone(from: self.dueDateComponents, timeZoneHint: self.timeZone),
            startDate: formatDueDateWithTimezone(from: self.startDateComponents, timeZoneHint: self.timeZone),
            completionDate: self.completionDate.map { formatEventDate($0, preferredTimeZone: preferredTimeZone, includeTime: true) },
            creationDate: self.creationDate.map { formatEventDate($0, preferredTimeZone: preferredTimeZone, includeTime: true) },
            lastModifiedDate: self.lastModifiedDate.map { formatEventDate($0, preferredTimeZone: preferredTimeZone, includeTime: true) },
            externalId: self.calendarItemExternalIdentifier,
            priority: self.priority,
            alarms: alarms,
            recurrenceRules: recurrenceRules,
            locationTrigger: locationTrigger
        )
    }
}
extension EKCalendar {
    func toJSON() -> ListJSON {
        ListJSON(
            id: self.calendarIdentifier,
            title: self.title,
            color: self.cgColor?.toHex()
        )
    }

    func toCalendarJSON() -> CalendarJSON {
        CalendarJSON(
            id: self.calendarIdentifier,
            title: self.title,
            account: self.source.title,
            accountType: sourceTypeString(self.source.sourceType)
        )
    }
}

private func sourceTypeString(_ type: EKSourceType) -> String {
    switch type {
    case .local: return "local"
    case .exchange: return "exchange"
    case .calDAV: return "caldav"
    case .mobileMe: return "mobileme"
    case .subscribed: return "subscribed"
    case .birthdays: return "birthdays"
    @unknown default: return "unknown"
    }
}

// MARK: - Helper to convert CGColor to hex string
extension CGColor {
    func toHex() -> String? {
        guard let components = self.components, components.count >= 3 else {
            return nil
        }

        let r = Int(round(components[0] * 255))
        let g = Int(round(components[1] * 255))
        let b = Int(round(components[2] * 255))

        return String(format: "#%02X%02X%02X", r, g, b)
    }
}

// MARK: - Helper to convert hex string to CGColor
extension CGColor {
    static func fromHex(_ hex: String) -> CGColor? {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else {
            return nil
        }

        let r = CGFloat((rgb & 0xFF0000) >> 16) / 255.0
        let g = CGFloat((rgb & 0x00FF00) >> 8) / 255.0
        let b = CGFloat(rgb & 0x0000FF) / 255.0

        return CGColor(red: r, green: g, blue: b, alpha: 1.0)
    }
}

private func formatEventDate(_ date: Date, preferredTimeZone: TimeZone, includeTime: Bool) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = preferredTimeZone
    formatter.dateFormat = includeTime ? "yyyy-MM-dd'T'HH:mm:ssZZZZZ" : "yyyy-MM-ddZZZZZ"
    return formatter.string(from: date)
}

private func eventAvailabilityToString(_ availability: EKEventAvailability) -> String {
    switch availability {
    case .notSupported: return "not-supported"
    case .busy: return "busy"
    case .free: return "free"
    case .tentative: return "tentative"
    case .unavailable: return "unavailable"
    @unknown default: return "unknown"
    }
}

private func eventStatusToString(_ status: EKEventStatus) -> String {
    switch status {
    case .none: return "none"
    case .confirmed: return "confirmed"
    case .tentative: return "tentative"
    case .canceled: return "canceled"
    @unknown default: return "unknown"
    }
}

private func participantStatusToString(_ status: EKParticipantStatus) -> String {
    switch status {
    case .unknown: return "unknown"
    case .pending: return "pending"
    case .accepted: return "accepted"
    case .declined: return "declined"
    case .tentative: return "tentative"
    case .delegated: return "delegated"
    case .completed: return "completed"
    case .inProcess: return "in-process"
    @unknown default: return "unknown"
    }
}

private func participantRoleToString(_ role: EKParticipantRole) -> String {
    switch role {
    case .unknown: return "unknown"
    case .required: return "required"
    case .optional: return "optional"
    case .chair: return "chair"
    case .nonParticipant: return "non-participant"
    @unknown default: return "unknown"
    }
}

private func participantTypeToString(_ type: EKParticipantType) -> String {
    switch type {
    case .unknown: return "unknown"
    case .person: return "person"
    case .room: return "room"
    case .resource: return "resource"
    case .group: return "group"
    @unknown default: return "unknown"
    }
}

private func participantToJSON(_ participant: EKParticipant) -> ParticipantJSON {
    return ParticipantJSON(
        name: participant.name,
        url: participant.url.absoluteString,
        status: participantStatusToString(participant.participantStatus),
        role: participantRoleToString(participant.participantRole),
        type: participantTypeToString(participant.participantType),
        isCurrentUser: participant.isCurrentUser
    )
}

extension EKEvent {
    func toJSON() -> EventJSON {
        let eventTimeZone = self.timeZone ?? TimeZone.current
        let includeTime = !self.isAllDay

        let alarms: [AlarmJSON]? = {
            guard let alarms = self.alarms else { return nil }
            let mapped = alarms.map { alarmToJSON($0, preferredTimeZone: eventTimeZone) }
            return mapped.isEmpty ? nil : mapped
        }()

        let recurrenceRules: [RecurrenceRuleJSON]? = {
            guard let rules = self.recurrenceRules else { return nil }
            let mapped = rules.compactMap { recurrenceRuleToJSON($0) }
            return mapped.isEmpty ? nil : mapped
        }()

        return EventJSON(
            id: self.eventIdentifier,
            title: self.title,
            calendar: self.calendar.title,
            startDate: formatEventDate(self.startDate, preferredTimeZone: eventTimeZone, includeTime: includeTime),
            endDate: formatEventDate(self.endDate, preferredTimeZone: eventTimeZone, includeTime: includeTime),
            notes: self.notes,
            location: self.location,
            structuredLocation: structuredLocationToJSON(self.structuredLocation),
            url: self.url?.absoluteString,
            isAllDay: self.isAllDay,
            availability: eventAvailabilityToString(self.availability),
            alarms: alarms,
            recurrenceRules: recurrenceRules,
            organizer: self.organizer.map { participantToJSON($0) },
            attendees: self.attendees?.map { participantToJSON($0) },
            status: eventStatusToString(self.status),
            isDetached: self.isDetached,
            occurrenceDate: self.occurrenceDate.map { formatEventDate($0, preferredTimeZone: eventTimeZone, includeTime: true) },
            creationDate: self.creationDate.map { formatEventDate($0, preferredTimeZone: eventTimeZone, includeTime: true) },
            lastModifiedDate: self.lastModifiedDate.map { formatEventDate($0, preferredTimeZone: eventTimeZone, includeTime: true) },
            externalId: self.calendarItemExternalIdentifier
        )
    }
}

struct ArgumentParser {
    private let args: [String: String]

    init() {
        var dict = [String: String]()
        var i = 0
        let arguments = Array(CommandLine.arguments.dropFirst())

        while i < arguments.count {
            let key = arguments[i].replacingOccurrences(of: "--", with: "")
            if i + 1 < arguments.count && !arguments[i + 1].hasPrefix("--") {
                dict[key] = arguments[i + 1]
                i += 2
            } else {
                dict[key] = "true"
                i += 1
            }
        }
        self.args = dict
    }

    func get(_ key: String) -> String? {
        return args[key]
    }
}

func main() {
    let parser = ArgumentParser()
    let manager = RemindersManager()
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted

    let outputError = { (message: String) in
        if let data = try? encoder.encode(ErrorOutput(message: message)),
           let json = String(data: data, encoding: .utf8) {
            print(json)
        }
        exit(1)
    }
    
    let action = parser.get("action") ?? ""

    let isCalendarAction = action == "read-events" || action == "read-calendars" || action == "create-event" || action == "update-event" || action == "delete-event"
    
    // Check permission status first (Best Practice)
    let checkAndRequestPermission: () -> Void = {
        if isCalendarAction {
            let status = manager.checkCalendarAuthorizationStatus()
            switch status {
            case .authorized, .fullAccess:
                // Already authorized, proceed directly
                handleAction()
            case .notDetermined:
                // Need to request permission
                manager.requestCalendarAccess { granted, error in
                    guard granted else {
                        let errorMsg = error?.localizedDescription ?? "Unknown error"
                        outputError("Calendar permission denied. \(errorMsg)\n\nThe permission dialog may not appear when running as a subprocess.\nTo fix this on macOS 26+, try one of:\n1. Run 'tccutil reset Calendar' in Terminal, then retry\n2. Manually grant access in: System Settings > Privacy & Security > Calendars\n3. Rebuild the server with 'pnpm build' to update code signing")
                        return
                    }
                    handleAction()
                }
            case .denied, .restricted:
                // Permission was denied or restricted
                outputError("Calendar permission denied or restricted.\n\nPlease grant Full Calendar Access in:\nSystem Settings > Privacy & Security > Calendars")
            case .writeOnly:
                // Write-only access is not sufficient for reading calendars
                outputError("Calendar permission is write-only, but read access is required.\n\nPlease grant Full Calendar Access in:\nSystem Settings > Privacy & Security > Calendars")
            @unknown default:
                outputError("Unknown calendar permission status.")
            }
        } else {
            let status = manager.checkRemindersAuthorizationStatus()
            switch status {
            case .authorized, .fullAccess:
                // Already authorized, proceed directly
                handleAction()
            case .notDetermined:
                // Need to request permission
                manager.requestAccess { granted, error in
                    guard granted else {
                        let errorMsg = error?.localizedDescription ?? "Unknown error"
                        outputError("Reminder permission denied. \(errorMsg)\n\nThe permission dialog may not appear when running as a subprocess.\nTo fix this on macOS 26+, try one of:\n1. Run 'tccutil reset Reminders' in Terminal, then retry\n2. Manually grant access in: System Settings > Privacy & Security > Reminders\n3. Rebuild the server with 'pnpm build' to update code signing")
                        return
                    }
                    handleAction()
                }
            case .denied, .restricted:
                // Permission was denied or restricted
                outputError("Reminder permission denied or restricted.\n\nPlease grant reminder permissions in:\nSystem Settings > Privacy & Security > Reminders")
            case .writeOnly:
                // Write-only access is not sufficient for reading reminders
                outputError("Reminder permission is write-only, but read access is required.\n\nPlease grant full reminder permissions in:\nSystem Settings > Privacy & Security > Reminders")
            @unknown default:
                outputError("Unknown reminder permission status.")
            }
        }
    }
    
    func handleAction() {
        do {
            switch action {
            case "read":
                let reminders = try manager.getReminders(showCompleted: parser.get("showCompleted") == "true", filterList: parser.get("filterList"), search: parser.get("search"), dueWithin: parser.get("dueWithin"))
                print(String(data: try encoder.encode(StandardOutput(result: ReadResult(lists: manager.getLists(), reminders: reminders))), encoding: .utf8)!)
            case "read-by-id":
                guard let id = parser.get("id") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--id required."]) }
                let reminder = try manager.getReminderById(id: id)
                print(String(data: try encoder.encode(StandardOutput(result: reminder)), encoding: .utf8)!)
            case "read-lists":
                print(String(data: try encoder.encode(StandardOutput(result: manager.getLists())), encoding: .utf8)!)
            case "create":
                guard let title = parser.get("title") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--title required."]) }
                let reminder = try manager.createReminder(
                    title: title,
                    listName: parser.get("targetList"),
                    notes: parser.get("note"),
                    location: parser.get("location"),
                    urlString: parser.get("url"),
                    startDateString: parser.get("startDate"),
                    dueDateString: parser.get("dueDate"),
                    priority: parser.get("priority").flatMap { Int($0) },
                    alarmsJSON: parser.get("alarms"),
                    recurrenceRulesJSON: parser.get("recurrenceRules") ?? parser.get("recurrence"),
                    locationTriggerJSON: parser.get("locationTrigger"),
                    isCompleted: parser.get("isCompleted").map { $0 == "true" }
                )
                print(String(data: try encoder.encode(StandardOutput(result: reminder)), encoding: .utf8)!)
            case "update":
                guard let id = parser.get("id") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--id required."]) }
                let reminder = try manager.updateReminder(
                    id: id,
                    newTitle: parser.get("title"),
                    listName: parser.get("targetList"),
                    notes: parser.get("note"),
                    location: parser.get("location"),
                    urlString: parser.get("url"),
                    isCompleted: parser.get("isCompleted").map { $0 == "true" },
                    completionDateString: parser.get("completionDate"),
                    startDateString: parser.get("startDate"),
                    dueDateString: parser.get("dueDate"),
                    priority: parser.get("priority").flatMap { Int($0) },
                    alarmsJSON: parser.get("alarms"),
                    clearAlarms: parser.get("clearAlarms").map { $0 == "true" },
                    recurrenceRulesJSON: parser.get("recurrenceRules") ?? parser.get("recurrence"),
                    clearRecurrence: parser.get("clearRecurrence").map { $0 == "true" },
                    locationTriggerJSON: parser.get("locationTrigger"),
                    clearLocationTrigger: parser.get("clearLocationTrigger").map { $0 == "true" }
                )
                print(String(data: try encoder.encode(StandardOutput(result: reminder)), encoding: .utf8)!)
            case "delete":
                guard let id = parser.get("id") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--id required."]) }
                try manager.deleteReminder(id: id); print(String(data: try encoder.encode(StandardOutput(result: DeleteResult(id: id))), encoding: .utf8)!)
            case "create-list":
                guard let title = parser.get("name") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--name required."]) }
                print(String(data: try encoder.encode(StandardOutput(result: try manager.createList(title: title, color: parser.get("color")))), encoding: .utf8)!)
            case "update-list":
                guard let name = parser.get("name") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--name required."]) }
                print(String(data: try encoder.encode(StandardOutput(result: try manager.updateList(currentName: name, newName: parser.get("newName"), color: parser.get("color")))), encoding: .utf8)!)
            case "delete-list":
                guard let title = parser.get("name") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--name required."]) }
                try manager.deleteList(title: title); print(String(data: try encoder.encode(StandardOutput(result: DeleteListResult(title: title))), encoding: .utf8)!)
            case "read-events":
                let startDateStr = parser.get("startDate")
                let endDateStr = parser.get("endDate")
                let startDate = startDateStr != nil ? manager.parseDate(from: startDateStr!) : nil
                let endDate = endDateStr != nil ? manager.parseDate(from: endDateStr!) : nil
                let events = try manager.getEvents(startDate: startDate, endDate: endDate, calendarName: parser.get("filterCalendar"), search: parser.get("search"), availability: parser.get("availability"), accountName: parser.get("filterAccount"))
                print(String(data: try encoder.encode(StandardOutput(result: EventsReadResult(calendars: manager.getCalendars(), events: events))), encoding: .utf8)!)
            case "read-calendars":
                print(String(data: try encoder.encode(StandardOutput(result: manager.getCalendars())), encoding: .utf8)!)
            case "create-event":
                guard let title = parser.get("title") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--title required."]) }
                guard let startDate = parser.get("startDate") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--startDate required."]) }
                guard let endDate = parser.get("endDate") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--endDate required."]) }
                let event = try manager.createEvent(
                    title: title,
                    calendarName: parser.get("targetCalendar"),
                    startDateString: startDate,
                    endDateString: endDate,
                    notes: parser.get("note"),
                    location: parser.get("location"),
                    structuredLocationJSON: parser.get("structuredLocation"),
                    urlString: parser.get("url"),
                    isAllDay: parser.get("isAllDay").map { $0 == "true" },
                    availability: parser.get("availability"),
                    alarmsJSON: parser.get("alarms"),
                    recurrenceRulesJSON: parser.get("recurrenceRules")
                )
                print(String(data: try encoder.encode(StandardOutput(result: event)), encoding: .utf8)!)
            case "update-event":
                guard let id = parser.get("id") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--id required."]) }
                let event = try manager.updateEvent(
                    id: id,
                    title: parser.get("title"),
                    calendarName: parser.get("targetCalendar"),
                    startDateString: parser.get("startDate"),
                    endDateString: parser.get("endDate"),
                    notes: parser.get("note"),
                    location: parser.get("location"),
                    structuredLocationJSON: parser.get("structuredLocation"),
                    urlString: parser.get("url"),
                    isAllDay: parser.get("isAllDay").map { $0 == "true" },
                    availability: parser.get("availability"),
                    alarmsJSON: parser.get("alarms"),
                    clearAlarms: parser.get("clearAlarms").map { $0 == "true" },
                    recurrenceRulesJSON: parser.get("recurrenceRules"),
                    clearRecurrence: parser.get("clearRecurrence").map { $0 == "true" },
                    span: parser.get("span")
                )
                print(String(data: try encoder.encode(StandardOutput(result: event)), encoding: .utf8)!)
            case "delete-event":
                guard let id = parser.get("id") else { throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "--id required."]) }
                try manager.deleteEvent(id: id, span: parser.get("span")); print(String(data: try encoder.encode(StandardOutput(result: DeleteResult(id: id))), encoding: .utf8)!)
            default: throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid or missing --action."])
            }
        } catch { outputError(error.localizedDescription) }
        exit(0)
    }
    
    checkAndRequestPermission()
    RunLoop.main.run()
}

main()
