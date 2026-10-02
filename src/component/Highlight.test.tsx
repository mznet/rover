import { render } from "@testing-library/react";

import Highlight from "./Highlight";

const boldTexts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("strong")).map((e) => e.textContent);

test("bolds every case-insensitive match of each term", () => {
  const { container } = render(
    <Highlight text="React Docs - react.dev" keyword="react docs" />
  );
  expect(boldTexts(container)).toEqual(["React", "Docs", "react"]);
  expect(container.textContent).toBe("React Docs - react.dev");
});

test("treats regex characters in the keyword literally", () => {
  const { container } = render(<Highlight text="a.b axb" keyword="a.b" />);
  expect(boldTexts(container)).toEqual(["a.b"]);
});

test("renders plain text for an empty keyword", () => {
  const { container } = render(<Highlight text="React" keyword="  " />);
  expect(boldTexts(container)).toEqual([]);
  expect(container.textContent).toBe("React");
});
