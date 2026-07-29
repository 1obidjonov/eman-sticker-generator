import type {
  IProductParser,
  ParserDescriptor,
} from './IProductParser.js';

export class ParserRegistry {
  private readonly parsers: IProductParser[] = [];

  register(parser: IProductParser): this {
    if (this.parsers.some((candidate) => candidate.id === parser.id)) {
      throw new Error(`Парсер с id "${parser.id}" уже зарегистрирован.`);
    }
    this.parsers.push(parser);
    return this;
  }

  resolve(url: string): IProductParser | null {
    return this.parsers.find((parser) => parser.canParse(url)) ?? null;
  }

  list(): ParserDescriptor[] {
    return this.parsers.map(({ id, displayName, description }) => ({
      id,
      displayName,
      description,
    }));
  }
}
