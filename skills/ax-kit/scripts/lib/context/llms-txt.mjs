const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const MARKDOWN_TARGET = /\.(md|mdx|txt)([?#].*)?$/i;

export function parseLlmsTxt(source) {
  const text = source.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const firstLine = lines.find((line) => line.trim() !== '') ?? '';
  const links = [...text.matchAll(MARKDOWN_LINK)].map(([, name, url]) => ({ name, url }));

  return {
    title: /^#\s+\S/.test(firstLine) ? firstLine.replace(/^#\s+/, '').trim() : null,
    summary: lines.find((line) => line.startsWith('>'))?.replace(/^>\s*/, '') ?? null,
    sections: lines.filter((line) => /^##\s+\S/.test(line)).map((line) => line.replace(/^##\s+/, '').trim()),
    links,
    markdownLinks: links.filter((link) => MARKDOWN_TARGET.test(link.url)),
    chars: text.length,
    looksLikeHtml: /^\s*<(!doctype|html)\b/i.test(text),
  };
}

export function loadLlmsTxt(ctx) {
  return ctx.once('llmsTxt', async () => {
    const snapshot = await ctx.get(ctx.at('/llms.txt'));
    return { snapshot, found: snapshot.status === 200, ...parseLlmsTxt(snapshot.status === 200 ? snapshot.body : '') };
  });
}
