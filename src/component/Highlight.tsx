const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface HighlightProps {
  text: string;
  keyword: string;
}

function Highlight({ text, keyword }: HighlightProps) {
  const terms = keyword
    .split(/\s+/)
    .filter(Boolean)
    // Longer terms first so "react" wins over "re" when both match.
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);

  if (terms.length === 0) return <>{text}</>;

  // A capturing group makes split keep the matches at odd indices.
  const parts = text.split(new RegExp(`(${terms.join("|")})`, "gi"));

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? <strong key={index}>{part}</strong> : part
      )}
    </>
  );
}

export default Highlight;
