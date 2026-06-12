import { describe, expect, test } from "bun:test";
import { htmlToReadableText } from "./html-text";

describe("htmlToReadableText", () => {
  test("converts <br> variants to newlines", () => {
    expect(htmlToReadableText("第一行<br>第二行<br/>第三行<br />第四行")).toBe(
      "第一行\n第二行\n第三行\n第四行",
    );
  });

  test("block closers become newlines and tags are stripped", () => {
    expect(htmlToReadableText("<p>段落一</p><p>段落二 <strong>加粗</strong></p>")).toBe(
      "段落一\n段落二 加粗",
    );
  });

  test("list items get bullets", () => {
    expect(htmlToReadableText("<ul><li>甲</li><li>乙</li></ul>")).toBe("• 甲\n• 乙");
  });

  test("decodes named, decimal and hex entities", () => {
    expect(htmlToReadableText("A &amp; B &lt;tag&gt; &#20013;&#x6587; &nbsp;x &hellip;")).toBe(
      "A & B <tag> 中文  x …",
    );
  });

  test("drops script and style bodies entirely", () => {
    expect(htmlToReadableText('before<script>alert("x")</script>after')).toBe("beforeafter");
    expect(htmlToReadableText("a<style>p{color:red}</style>b")).toBe("ab");
  });

  test("collapses 3+ newlines to a blank line and trims", () => {
    expect(htmlToReadableText("<p>一</p><p></p><p></p><p>二</p>")).toBe("一\n\n二");
  });

  test("plain text passes through unchanged", () => {
    expect(htmlToReadableText("纯文本，没有标签。")).toBe("纯文本，没有标签。");
  });

  test("decoded entities cannot reintroduce markup (output is text, not HTML)", () => {
    // &lt;img&gt; decodes to the literal string "<img>" — safe because the result is
    // rendered as a text node, never via dangerouslySetInnerHTML.
    expect(htmlToReadableText("&lt;img src=x onerror=alert(1)&gt;")).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });
});
