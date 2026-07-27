import { getDatabase } from "../database/connection.js";
import { UploadRepository } from "../database/uploadRepository.js";
import { MetadataBlacklist } from "../types/index.js";


function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s#]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extractCTA(description: string): string | null {
    const lines = description
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);

    const ctaRegex =
        /(follow|subscribe|like|comment|share|watch|save|support|join)/i;

    for (const line of lines) {
        if (ctaRegex.test(line)) {
            return normalize(line);
        }
    }

    return null;
}

function firstSentence(description: string): string | null {
    const sentence = description
        .split(/[.!?]/)[0]
        ?.trim();

    if (!sentence) return null;

    return normalize(sentence);
}

export function buildMetadataBlacklist(
    //   records: UploadRecord[]
): MetadataBlacklist {

    const db = getDatabase();
    const uploadRepository = new UploadRepository(db);
    const records = uploadRepository.listRecent(10);
    const titles = new Set<string>();
    const openings = new Set<string>();
    const ctas = new Set<string>();

    for (const record of records) {
        if (record.title)
            titles.add(normalize(record.title));

        if (record.description) {
            const opening = firstSentence(record.description);
            if (opening) openings.add(opening);

            const cta = extractCTA(record.description);
            if (cta) ctas.add(cta);
        }

    }

    return {
        recentTitles: [...titles],
        recentDescriptionOpenings: [...openings],
        recentCTAs: [...ctas]
    }
}