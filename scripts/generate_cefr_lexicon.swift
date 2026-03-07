import Foundation
import PDFKit

struct SourceConfig {
    let filePath: String
    let source: String
}

struct LexiconEntry: Codable {
    let term: String
    let rawTerm: String
    let cefr: String
    let partsOfSpeech: [String]
    let rawPartsOfSpeech: String
    let source: String
    let normalizedForms: [String]
}

enum ParseError: Error {
    case missingText(String)
}

let allowedLevels = Set(["A1", "A2", "B1", "B2", "C1", "C2"])
let ignoredLinePrefixes = [
    "The Oxford 3000",
    "The Oxford 5000",
    "© Oxford University Press"
]

let configs = [
    SourceConfig(filePath: "/Users/ryuto/Downloads/The_Oxford_3000_by_CEFR_level.pdf", source: "oxford3000"),
    SourceConfig(filePath: "/Users/ryuto/Downloads/The_Oxford_5000_by_CEFR_level.pdf", source: "oxford5000")
]

let partOfSpeechMap: [String: String] = [
    "adj.": "adjective",
    "adv.": "adverb",
    "auxiliary v.": "auxiliary verb",
    "conj.": "conjunction",
    "det.": "determiner",
    "exclam.": "exclamation",
    "indefinite article": "article",
    "modal v.": "modal verb",
    "n.": "noun",
    "number": "number",
    "phr. v.": "phrasal verb",
    "predet.": "predeterminer",
    "prep.": "preposition",
    "pron.": "pronoun",
    "symbol": "symbol",
    "v.": "verb"
]

func normalizeWhitespace(_ value: String) -> String {
    value
        .replacingOccurrences(of: "\u{08}", with: " ")
        .components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
}

func cleanLine(_ line: String) -> String {
    normalizeWhitespace(line)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func isPageMarker(_ line: String) -> Bool {
    let trimmed = cleanLine(line)
    return trimmed.range(of: #"^\d+\s*/\s*\d+$"#, options: .regularExpression) != nil
}

func isHeaderOrFooter(_ line: String) -> Bool {
    let trimmed = cleanLine(line)
    if trimmed.isEmpty || isPageMarker(trimmed) {
        return true
    }

    return ignoredLinePrefixes.contains { trimmed.hasPrefix($0) }
}

func splitPosLabels(_ raw: String) -> [String] {
    raw
        .replacingOccurrences(of: "/", with: ",")
        .split(separator: ",")
        .map { normalizeWhitespace(String($0)) }
        .filter { !$0.isEmpty }
        .map { partOfSpeechMap[$0] ?? $0.replacingOccurrences(of: ".", with: "") }
}

func normalizedForms(for rawTerm: String) -> [String] {
    let withoutSenseDigits = rawTerm.replacingOccurrences(of: #"(?<=\D)\d+$"#, with: "", options: .regularExpression)

    let cleaned = withoutSenseDigits
        .replacingOccurrences(of: "’", with: "'")
        .replacingOccurrences(of: #"\(.*?\)"#, with: "", options: .regularExpression)
        .replacingOccurrences(of: #"[^A-Za-z'\-/, ]"#, with: " ", options: .regularExpression)

    let components = cleaned
        .split(separator: ",")
        .flatMap { segment in
            String(segment)
                .split(separator: "/")
                .map(String.init)
        }
        .map { normalizeWhitespace($0).lowercased() }
        .filter { !$0.isEmpty }

    return Array(Set(components)).sorted()
}

func parseEntryLine(_ line: String, cefr: String, source: String) -> LexiconEntry? {
    let trimmed = cleanLine(line)
    guard !trimmed.isEmpty else {
        return nil
    }

    if let match = trimmed.range(of: #" (adj\.|adv\.|auxiliary v\.|conj\.|det\.|exclam\.|indefinite article|modal v\.|n\.|number|phr\. v\.|predet\.|prep\.|pron\.|symbol|v\.)"#, options: .regularExpression) {
        let term = String(trimmed[..<match.lowerBound]).trimmingCharacters(in: .whitespaces)
        let rawPartsOfSpeech = String(trimmed[match.upperBound...]).isEmpty
            ? String(trimmed[match.lowerBound...]).trimmingCharacters(in: .whitespaces)
            : String(trimmed[match.lowerBound...]).trimmingCharacters(in: .whitespaces)

        let normalized = normalizedForms(for: term)
        guard !term.isEmpty, !normalized.isEmpty else {
            return nil
        }

        return LexiconEntry(
            term: term.replacingOccurrences(of: #"(?<=\D)\d+$"#, with: "", options: .regularExpression),
            rawTerm: term,
            cefr: cefr,
            partsOfSpeech: splitPosLabels(rawPartsOfSpeech),
            rawPartsOfSpeech: rawPartsOfSpeech,
            source: source,
            normalizedForms: normalized
        )
    }

    return nil
}

func extractLines(from config: SourceConfig) throws -> [String] {
    let url = URL(fileURLWithPath: config.filePath)
    let data = try Data(contentsOf: url)
    guard let pdf = PDFDocument(data: data) else {
        throw ParseError.missingText(config.filePath)
    }

    var lines: [String] = []
    for index in 0..<pdf.pageCount {
        guard let text = pdf.page(at: index)?.string else {
            continue
        }

        lines.append(contentsOf: text.split(separator: "\n").map(String.init))
    }

    return lines
}

var allEntries: [LexiconEntry] = []

for config in configs {
    let lines = try extractLines(from: config)
    var currentLevel: String?

    for line in lines {
        let trimmed = cleanLine(line)

        if isHeaderOrFooter(trimmed) {
            continue
        }

        if allowedLevels.contains(trimmed) {
            currentLevel = trimmed
            continue
        }

        guard let level = currentLevel else {
            continue
        }

        if let entry = parseEntryLine(trimmed, cefr: level, source: config.source) {
            allEntries.append(entry)
        }
    }
}

let dedupedEntries = Dictionary(grouping: allEntries) { entry in
    [
        entry.term.lowercased(),
        entry.cefr,
        entry.rawPartsOfSpeech.lowercased(),
        entry.source,
        entry.normalizedForms.joined(separator: "|")
    ].joined(separator: "::")
}
.values
.compactMap { $0.first }
.sorted {
    if $0.cefr == $1.cefr {
        return $0.term.localizedCaseInsensitiveCompare($1.term) == .orderedAscending
    }

    let order = ["A1", "A2", "B1", "B2", "C1", "C2"]
    return order.firstIndex(of: $0.cefr)! < order.firstIndex(of: $1.cefr)!
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
let data = try encoder.encode(dedupedEntries)

let outputDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("data", isDirectory: true)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
let outputURL = outputDirectory.appendingPathComponent("cefr-lexicon.json")
try data.write(to: outputURL)

print("Wrote \(dedupedEntries.count) entries to \(outputURL.path)")
