export default async function codewordGate(request, context) {
  const url = new URL(request.url);

  if (isPublicAsset(url.pathname) || request.method === "OPTIONS") {
    return context.next();
  }

  const codeword = getConfiguredCodeword();
  if (!codeword) {
    return renderGate({
      status: 503,
      returnTo: requestedPath(url),
      message: "Access is not configured yet. Set HOPKINS_CODEWORD in Netlify, then redeploy."
    });
  }

  const admittedValue = await admissionValue(codeword);
  if (hasAdmissionCookie(request.headers.get("cookie"), admittedValue)) {
    return context.next();
  }

  if (url.pathname === "/__admit" && request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const submittedCodeword = form ? String(form.get("codeword") || "") : "";
    const returnTo = safeReturnTo(form ? String(form.get("return_to") || "/") : "/");

    if (submittedCodeword === codeword) {
      const headers = new Headers({ Location: returnTo });
      headers.append("Set-Cookie", admissionCookie(admittedValue, url.protocol === "https:"));
      headers.append("Cache-Control", "no-store");
      return new Response(null, { status: 303, headers });
    }

    return renderGate({
      status: 401,
      returnTo,
      message: "That codeword did not work."
    });
  }

  return renderGate({
    status: 401,
    returnTo: requestedPath(url)
  });
}

function getConfiguredCodeword() {
  return Deno.env.get("HOPKINS_CODEWORD") || Deno.env.get("SITE_CODEWORD") || "";
}

function requestedPath(url) {
  return `${url.pathname}${url.search}`;
}

function safeReturnTo(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function isPublicAsset(pathname) {
  if (pathname.startsWith("/netlify/")) {
    return false;
  }

  if (pathname === "/main.css" || pathname === "/favicon.ico" || pathname === "/robots.txt") {
    return true;
  }

  return /\.(css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|txt|xml|webmanifest)$/i.test(pathname);
}

function hasAdmissionCookie(cookieHeader, expectedValue) {
  if (!cookieHeader) return false;

  return cookieHeader.split(";").some((part) => {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== "hopkins_admitted") return false;
    return rawValueParts.join("=") === expectedValue;
  });
}

async function admissionValue(codeword) {
  const data = new TextEncoder().encode(`hopkins:${codeword}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function admissionCookie(value, secure) {
  const parts = [
    `hopkins_admitted=${value}`,
    "Path=/",
    "Max-Age=2592000",
    "HttpOnly",
    "SameSite=Lax"
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function renderGate({ status, returnTo, message = "" }) {
  const safeReturn = escapeHtml(safeReturnTo(returnTo));
  const safeMessage = escapeHtml(message);

  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, noarchive">
  <title>Hopkins — Access</title>
  <link rel="stylesheet" href="/main.css">
</head>
<body>
  <div id="main">
    <h1>Hopkins</h1>
    <p id="tagline">A repository of poetry</p>
    <hr>
    <form method="post" action="/__admit">
      <input type="hidden" name="return_to" value="${safeReturn}">
      <p><label for="codeword">Codeword</label></p>
      <p><input id="codeword" name="codeword" type="password" autocomplete="current-password" autofocus required></p>
      <p><button type="submit">Enter</button></p>
    </form>
    ${safeMessage ? `<p id="tagline">${safeMessage}</p>` : ""}
  </div>
</body>
</html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, noarchive"
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
