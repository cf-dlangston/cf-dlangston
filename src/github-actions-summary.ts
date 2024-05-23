import { EOL } from 'os';
import * as fs from 'fs';

const { access, appendFile, writeFile } = fs.promises;

const SUMMARY_ENV_VAR = 'GITHUB_STEP_SUMMARY';

type SummaryWriteOptions = {
    overwrite?: boolean;
};

type SummaryTableCell = (string | {
    header?: boolean;
    data: string;
    colspan?: number;
    rowspan?: number;
})[];

type SummaryImageOptions = {
    width?: string;
    height?: string;
};

class Summary {
    #_buffer: string = '';
    #_filePath?: string;

    async #filePath(): Promise<string> {
        if (this.#_filePath) {
            return this.#_filePath;
        }

        const pathFromEnv = process.env[SUMMARY_ENV_VAR];
        if (!pathFromEnv) {
            throw new Error(
                `Unable to find environment variable for $${SUMMARY_ENV_VAR}. Check if your runtime environment supports job summaries.`
            );
        }

        try {
            await access(pathFromEnv, fs.constants.R_OK | fs.constants.W_OK);
        } catch {
            throw new Error(
                `Unable to access summary file: '${pathFromEnv}'. Check if the file has correct read/write permissions.`
            );
        }

        this.#_filePath = pathFromEnv;
        return this.#_filePath;
    }

    #wrap(tag: string, content: string | null, attrs: { [attribute: string]: string } = {}): string {
        const htmlAttrs = Object.entries(attrs)
            .map(([key, value]) => ` ${key}="${value}"`)
            .join('');

        if (!content) {
            return `<${tag}${htmlAttrs}>`;
        }

        return `<${tag}${htmlAttrs}>${content}</${tag}>`;
    }

    async write(options?: SummaryWriteOptions): Promise<Summary> {
        const overwrite = !!options?.overwrite;
        const filePath = await this.#filePath();
        const writeFunc = overwrite ? writeFile : appendFile;
        await writeFunc(filePath, this.#_buffer, { encoding: 'utf8' });
        return this.emptyBuffer();
    }

    async clear(): Promise<Summary> {
        return this.emptyBuffer().write({ overwrite: true });
    }

    stringify(): string {
        return this.#_buffer;
    }

    isEmptyBuffer(): boolean {
        return this.#_buffer.length === 0;
    }

    emptyBuffer(): Summary {
        this.#_buffer = '';
        return this;
    }

    addRaw(text: string, addEOL = false): Summary {
        this.#_buffer += text;
        return addEOL ? this.addEOL() : this;
    }

    addEOL(): Summary {
        return this.addRaw(EOL);
    }

    addCodeBlock(code: string, lang?: string): Summary {
        const attrs = {
            ...(lang && { lang })
        };
        const element = this.#wrap('pre', this.#wrap('code', code), attrs);
        return this.addRaw(element).addEOL();
    }

    addList(items: string[], ordered = false): Summary {
        const tag = ordered ? 'ol' : 'ul';
        const listItems = items.map(item => this.#wrap('li', item)).join('');
        const element = this.#wrap(tag, listItems);
        return this.addRaw(element).addEOL();
    }

    addTable(rows: SummaryTableCell[]): Summary {
        const tableBody = rows
            .map(row => {
                const cells = row
                    .map(cell => {
                        if (typeof cell === 'string') {
                            return this.#wrap('td', cell);
                        }

                        const { header, data, colspan, rowspan } = cell;
                        const tag = header ? 'th' : 'td';
                        const attrs = {
                            ...(colspan && { colspan }),
                            ...(rowspan && { rowspan })
                        };

                        return this.#wrap(tag, data, <any>attrs);
                    })
                    .join('');

                return this.#wrap('tr', cells);
            })
            .join('');

        const element = this.#wrap('table', tableBody);
        return this.addRaw(element).addEOL();
    }

    addDetails(label: string, content: string): Summary {
        const element = this.#wrap('details', this.#wrap('summary', label) + content);
        return this.addRaw(element).addEOL();
    }

    addImage(src: string, alt: string, options?: SummaryImageOptions): Summary {
        const { width, height } = options || {};
        const attrs = {
            ...(width && { width }),
            ...(height && { height })
        };

        const element = this.#wrap('img', null, { src, alt, ...attrs });
        return this.addRaw(element).addEOL();
    }

    addHeading(text: string, level: number | string = 1): Summary {
        const tag = `h${level}`;
        const allowedTag = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)
            ? tag
            : 'h1';
        const element = this.#wrap(allowedTag, text);
        return this.addRaw(element).addEOL();
    }

    addSeparator(): Summary {
        const element = this.#wrap('hr', null);
        return this.addRaw(element).addEOL();
    }

    addBreak(): Summary {
        const element = this.#wrap('br', null);
        return this.addRaw(element).addEOL();
    }

    addQuote(text: string, cite?: string): Summary {
        const attrs = {
            ...(cite && { cite })
        };
        const element = this.#wrap('blockquote', text, attrs);
        return this.addRaw(element).addEOL();
    }

    addLink(text: string, href: string): Summary {
        const element = this.#wrap('a', text, { href });
        return this.addRaw(element).addEOL();
    }
}

export default Summary;
