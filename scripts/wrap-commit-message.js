#!/usr/bin/env node

const BODY_WIDTH = 80;

const FOOTER_PREFIXES = [
  'BREAKING CHANGE',
  'Co-authored-by:',
  'Signed-off-by:',
  'Reviewed-by:',
  'Acked-by:',
  'Refs:',
  'See-also:',
];

function isFooterLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  return FOOTER_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function wrapLine(line, width) {
  if (line.length <= width) {
    return [line];
  }

  const wrapped = [];
  let remaining = line;

  while (remaining.length > width) {
    let breakAt = remaining.lastIndexOf(' ', width);
    if (breakAt <= 0) {
      breakAt = width;
    }
    wrapped.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }

  if (remaining.length > 0) {
    wrapped.push(remaining);
  }

  return wrapped;
}

function wrapParagraph(paragraph, width) {
  const lines = [];
  for (const line of paragraph.split('\n')) {
    if (line.trim() === '') {
      lines.push('');
      continue;
    }
    lines.push(...wrapLine(line, width));
  }
  return lines;
}

function splitMessage(message) {
  const lines = message.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length === 0 || lines[0].trim() === '') {
    return { subject: '', body: [], footers: [] };
  }

  const subject = lines[0];
  let index = 1;

  if (index < lines.length && lines[index].trim() === '') {
    index += 1;
  }

  const body = [];
  const footers = [];

  while (index < lines.length) {
    const line = lines[index];
    if (isFooterLine(line)) {
      footers.push(...lines.slice(index));
      break;
    }
    body.push(line);
    index += 1;
  }

  return { subject, body, footers };
}

function formatMessage({ subject, body, footers }) {
  const parts = [subject];

  if (body.length > 0) {
    parts.push('', ...body);
  }

  if (footers.length > 0) {
    parts.push('');
    parts.push(...footers);
  }

  return `${parts.join('\n')}\n`;
}

async function main() {
  const input = await new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
  });

  const parsed = splitMessage(input);
  const wrappedBody = wrapParagraph(parsed.body.join('\n'), BODY_WIDTH).filter(
    (line, idx, arr) => !(line === '' && idx === arr.length - 1),
  );

  process.stdout.write(
    formatMessage({
      subject: parsed.subject,
      body: wrappedBody,
      footers: parsed.footers,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
