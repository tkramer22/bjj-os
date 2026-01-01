export function decodeHTML(html: string | undefined | null): string {
  if (!html) return '';
  
  const entityMap: Record<string, string> = {
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&quot;': '"',
    '&#34;': '"',
    '&amp;': '&',
    '&#38;': '&',
    '&lt;': '<',
    '&#60;': '<',
    '&gt;': '>',
    '&#62;': '>',
    '&nbsp;': ' ',
    '&#160;': ' ',
  };

  let decoded = html;
  for (const [entity, char] of Object.entries(entityMap)) {
    decoded = decoded.split(entity).join(char);
  }
  
  return decoded;
}
