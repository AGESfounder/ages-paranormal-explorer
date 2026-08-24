import React from 'react';
import { URL_REGEX, URL_TEST } from '@/lib/urlText';

// Renders text with URLs as clickable blue links. The narrator uses
// stripUrlsForNarration to say "link" instead of reading the URL aloud.
export default function LinkifiedText({ text, className }) {
  if (!text) return null;
  const parts = text.split(URL_REGEX);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part && URL_TEST.test(part)) {
          const href = part.startsWith('http') ? part : `https://${part}`;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 hover:underline underline-offset-2 transition-colors break-all"
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}