export type SkillFrontmatter = {
  name?: string;
  description?: string;
};

const KEY_VALUE = /^([a-zA-Z0-9_-]+):\s*(.*)$/;

const normalizeFrontmatterValue = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const parseSkillFrontmatter = (content: string): SkillFrontmatter => {
  if (!content.startsWith('---')) {
    return {};
  }

  const lines = content.split(/\r?\n/);
  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === '---') {
      end = index;
      break;
    }
  }

  if (end === -1) {
    return {};
  }

  const frontmatter: SkillFrontmatter = {};

  for (let index = 1; index < end; index += 1) {
    const line = lines[index]?.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(KEY_VALUE);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = normalizeFrontmatterValue(rawValue);

    if (key === 'name' && value) {
      frontmatter.name = value;
    }
    if (key === 'description' && value) {
      frontmatter.description = value;
    }
  }

  return frontmatter;
};
