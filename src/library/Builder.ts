import * as fs from 'fs';
import * as path from 'path';
import { default as Handlebars } from 'handlebars';
import { TemplateType, Template } from './Template';
import { SVG } from './SVG';
import { Markdown } from './Markdown';
import { GitHubStatsFetcher } from './GithubStats';
import * as yaml from 'js-yaml';
import packageJson from '../package.json';
import { default as mime } from 'mime';

Handlebars.registerHelper('ifCond', function (this: any, v1, operator, v2, options) {
    switch (operator) {
        case '==':
            return (v1 == v2) ? options.fn(this as any) : options.inverse(this);
        case '===':
            return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=':
            return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==':
            return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<':
            return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=':
            return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>':
            return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=':
            return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&':
            return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||':
            return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default:
            return options.inverse(this);
    }
});

export const cwd = process.cwd();
const templatesFilePath = path.join(cwd, 'build-config.json');
export const outDir = path.join(cwd, 'out');

export function get_default_templates(): Template[] {
    return JSON.parse(fs.readFileSync(templatesFilePath, 'utf8'));
}

async function populateTemplate(template: string, input: any, debug: boolean = false): Promise<any> {
    input.build_time = new Date();
    input.build_version = packageJson.version;
    if (input.files && Array.isArray(input.files)) {
        const newFilesObj: any = {};
        for (let i = 0; i < input.files.length; i++) {
            const file: string = input.files[i];
            const contentType = mime.getType(file) || 'application/octet-stream';
            const fileContent = fs.readFileSync(path.join(cwd, 'static', file), { encoding: 'base64' });

            newFilesObj[file.replace('.', '_')] = `data:${contentType};base64,${fileContent}`;
        }
        input.files = newFilesObj;
    }
    if (input.github && Object.keys(input.github).includes("username") && !input.githubPrepopulated) {
        const githubStats = new GitHubStatsFetcher(input.github.username, process.env.PERSONAL_ACCESS_TOKEN ?? process.env.GITHUB_TOKEN);
        input.github = await githubStats.fetchStats(debug);
        input.githubPrepopulated = true;
    }
    return input;
}
async function validate(type: TemplateType, input: string): Promise<boolean> {
    switch (type) {
        case TemplateType.SVG:
            return SVG.Instance.validate(input)
        case TemplateType.Markdown:
            return await Markdown.Instance.validate(input);
        default:
            throw `Not Implemented: ${type}`;
    }
}
async function minify(type: TemplateType, input: string, debug: boolean = false, con?: typeof console): Promise<string> {
    switch (type) {
        case TemplateType.SVG:
            return await SVG.Instance.minify(input, debug, con)
        case TemplateType.Markdown:
            return await Markdown.Instance.minify(input, con);
        default:
            throw `Not Implemented: ${type}`;
    }
}
async function processTemplate(template: Template, templates: Template[], con?: typeof console) {
    if (template.type == TemplateType.DarkSVGVarient) {
        const originalSVGTemplate: Template = JSON.parse(JSON.stringify(templates.find(t => t.out == template.in)));
        originalSVGTemplate.out = template.out;
        originalSVGTemplate.data.darkThemeClass = "dark";
        await processTemplate(originalSVGTemplate, templates);
        return;
    }

    const templateSource = fs.readFileSync(path.join(cwd, 'templates', template.in), 'utf8');
    const handlebars = Handlebars.compile(templateSource);
    const data = await populateTemplate(template.in, template.data);
    let file: string;

    switch (template.type) {
        case TemplateType.SVG:
            const config: any = yaml.load(handlebars(data));
            file = await SVG.Instance.generateSVGFromConfig(config, data);
            break;
        case TemplateType.Markdown:
            file = handlebars(data);
            break;
        default:
            throw `Not Implemented: ${template.type}`;
    }

    if (!(await validate(template.type, file))) throw `Invalid ${template.type} template: '${template.in}'`;

    const minifiedOutput = await minify(template.type, file);

    if (template.out != null) {
        const outFile = path.join(outDir, template.out);
        fs.writeFileSync(outFile, minifiedOutput);

        (con ?? console).log(`${template.type} file generated: '${outFile}'`);
    }
    else template.out = minifiedOutput;
}

export async function build(templates: Template[], debug: boolean = false, con?: typeof console): Promise<Template[]> {
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }

    for (let template of templates) {
        await processTemplate(template, templates, con);
    }
    return templates;
}