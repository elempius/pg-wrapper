const IDENT_START = /[a-zA-Z_]/;
const IDENT_CONT = /[a-zA-Z0-9_]/;

/**
 * Translates named `:param` placeholders into positional `$1, $2, ...` ones
 * pg expects, so callers can pass either an array (positional) or an object
 * (named) as params.
 *
 * Scans char-by-char rather than with a single blanket regex so that:
 *  - `::` type casts (e.g. `created_at::text`) are never mistaken for a
 *    named param.
 *  - colons inside single-quoted string literals (e.g. `'event:start'`) are
 *    left untouched instead of being spliced with an unrelated bound value.
 */
export function resolveParams(
    text: string,
    params: unknown[] | Record<string, unknown>,
): { text: string; values: unknown[] } {
    if (Array.isArray(params)) {
        return { text, values: params };
    }

    const values: unknown[] = [];
    const seen = new Map<string, number>();
    let result = '';
    let i = 0;

    while (i < text.length) {
        const ch = text[i];

        if (ch === "'") {
            // Copy the whole string literal verbatim; '' is an escaped quote inside it.
            let j = i + 1;
            while (j < text.length) {
                if (text[j] === "'") {
                    if (text[j + 1] === "'") {
                        j += 2;
                        continue;
                    }
                    j += 1;
                    break;
                }
                j += 1;
            }
            result += text.slice(i, j);
            i = j;
            continue;
        }

        if (ch === ':' && text[i + 1] === ':') {
            result += '::';
            i += 2;
            continue;
        }

        if (ch === ':' && IDENT_START.test(text[i + 1] ?? '')) {
            let j = i + 1;
            while (j < text.length && IDENT_CONT.test(text[j])) {
                j += 1;
            }

            const name = text.slice(i + 1, j);

            if (!Object.prototype.hasOwnProperty.call(params, name)) {
                throw new Error(`pg-wrapper: missing named parameter "${name}" for query.`);
            }

            let index = seen.get(name);

            if (index === undefined) {
                values.push((params as Record<string, unknown>)[name]);
                index = values.length;
                seen.set(name, index);
            }

            result += `$${index}`;
            i = j;
            continue;
        }

        result += ch;
        i += 1;
    }

    return { text: result, values };
}
