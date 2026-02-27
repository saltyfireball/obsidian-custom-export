function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kebabCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function serializeDataset(el: HTMLElement): string {
  const attrs: string[] = [];
  for (const [key, value] of Object.entries(el.dataset)) {
    if (value === undefined) continue;
    attrs.push(`data-${kebabCase(key)}="${escapeHtml(String(value))}"`);
  }
  return attrs.join(" ");
}

export function buildHtmlDocument(input: {
  title: string;
  bodyHtml: string;
  cssText: string;
  bodyClass?: string;
  previewClass?: string;
  previewStyle?: string;
  sizerStyle?: string;
  viewContentStyle?: string;
  readingViewStyle?: string;
  bannerHtml?: string;
}): string {
  const htmlClass = document.documentElement.className || "";
  const htmlData = serializeDataset(document.documentElement);
  const baseBodyClass = document.body.className || "";
  const bodyData = serializeDataset(document.body);

  const mobileClasses = ["is-mobile", "is-ios", "is-phone", "is-tablet", "is-android"];
  const filteredBodyClass = baseBodyClass
    .split(" ")
    .filter((cls) => !mobileClasses.includes(cls))
    .join(" ");

  const mergedBodyClass = [filteredBodyClass, input.bodyClass || ""]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");

  const htmlAttrs = [htmlClass ? `class="${escapeHtml(htmlClass)}"` : "", htmlData]
    .filter(Boolean)
    .join(" ");
  const bodyAttrs = [mergedBodyClass ? `class="${escapeHtml(mergedBodyClass)}"` : "", bodyData]
    .filter(Boolean)
    .join(" ");
  const previewClass = input.previewClass ? ` ${input.previewClass}` : "";
  const previewStyle = input.previewStyle ? ` style="${escapeHtml(input.previewStyle)}"` : "";

  const sizerStyle = input.sizerStyle ? ` style="${escapeHtml(input.sizerStyle)}"` : "";

  const viewContentStyle = input.viewContentStyle ? ` style="${escapeHtml(input.viewContentStyle)}"` : "";
  const readingViewStyle = input.readingViewStyle ? ` style="${escapeHtml(input.readingViewStyle)}"` : "";

  const bannerHtml = input.bannerHtml || "";

  return `<!doctype html>
<html ${htmlAttrs}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
${input.cssText}
  </style>
</head>
<body ${bodyAttrs}>
  <div class="app-container">
    <div class="workspace">
      <div class="workspace-split mod-vertical mod-root">
        <div class="workspace-leaf mod-active">
          <div class="workspace-leaf-content">
            <div class="view-content"${viewContentStyle}>
              <div class="markdown-reading-view"${readingViewStyle}>
                <div class="markdown-preview-view markdown-rendered${previewClass}"${previewStyle}>
${bannerHtml}
                  <div class="markdown-preview-sizer"${sizerStyle}>
${input.bodyHtml}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
  (function() {
    function getCodeText(button) {
      var wrapper = button.closest('.sf-codeblock-wrapper');
      if (wrapper) {
        var code = wrapper.querySelector('pre code');
        if (code) return code.innerText;
      }
      var pre = button.closest('pre');
      if (pre) return pre.innerText;
      return '';
    }
    function showToast(message) {
      var toast = document.createElement('div');
      toast.textContent = message;
      toast.style.position = 'fixed';
      toast.style.right = '16px';
      toast.style.bottom = '16px';
      toast.style.padding = '8px 12px';
      toast.style.background = 'rgba(0,0,0,0.7)';
      toast.style.color = '#fff';
      toast.style.borderRadius = '8px';
      toast.style.fontSize = '12px';
      toast.style.zIndex = '9999';
      toast.style.pointerEvents = 'none';
      document.body.appendChild(toast);
      setTimeout(function() {
        toast.remove();
      }, 1200);
    }
    function handleCopy(e) {
      var target = e.target;
      if (!target) return;
      var btn = target.closest('.sf-codeblock-copy, .copy-code-button');
      if (!btn) return;
      e.preventDefault();
      var text = getCodeText(btn);
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function() {});
      } else {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try { document.execCommand('copy'); } catch (err) {}
        document.body.removeChild(textarea);
      }
      btn.setAttribute('data-copied', 'true');
      setTimeout(function() {
        btn.setAttribute('data-copied', 'false');
      }, 1500);
      showToast('Copied!');
    }
    document.addEventListener('click', handleCopy);
    function normalizeTocAnchors() {
      var anchors = document.querySelectorAll('a.internal-link[target="_blank"]');
      anchors.forEach(function(a) {
        var href = a.getAttribute('href') || '';
        if (href.startsWith('#')) {
          a.removeAttribute('target');
          a.removeAttribute('rel');
        }
      });
    }
    function slugify(text) {
      return text
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\\s-]/g, '')
        .replace(/\\s+/g, '-')
        .replace(/-+/g, '-');
    }
    function ensureHeadingAnchors() {
      var headings = document.querySelectorAll('.markdown-preview-view h1, .markdown-preview-view h2, .markdown-preview-view h3, .markdown-preview-view h4, .markdown-preview-view h5, .markdown-preview-view h6');
      headings.forEach(function(h) {
        if (h.id) return;
        var text = h.textContent || '';
        var id = slugify(text);
        if (!id) return;
        if (!document.getElementById(id)) {
          h.id = id;
          return;
        }
        var suffix = 2;
        var nextId = id + '-' + suffix;
        while (document.getElementById(nextId)) {
          suffix += 1;
          nextId = id + '-' + suffix;
        }
        h.id = nextId;
      });
    }
    function retargetTocAnchors() {
      var anchors = document.querySelectorAll('a.internal-link[href^="#"]');
      anchors.forEach(function(a) {
        var href = a.getAttribute('href') || '';
        var target = href.slice(1);
        if (!target) return;
        if (document.getElementById(target)) return;
        var slug = slugify(target.replace(/[-_]+/g, ' '));
        if (slug && document.getElementById(slug)) {
          a.setAttribute('href', '#' + slug);
          return;
        }
        var match = Array.prototype.find.call(
          document.querySelectorAll('.markdown-preview-view h1, .markdown-preview-view h2, .markdown-preview-view h3, .markdown-preview-view h4, .markdown-preview-view h5, .markdown-preview-view h6'),
          function(h) { return (h.textContent || '').trim() === target.trim(); }
        );
        if (match && match.id) {
          a.setAttribute('href', '#' + match.id);
        }
      });
    }
    normalizeTocAnchors();
    ensureHeadingAnchors();
    retargetTocAnchors();
  })();
  </script>
</body>
</html>`;
}
