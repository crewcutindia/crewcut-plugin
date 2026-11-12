/* Pure ES3 ExtendScript helpers for CrewCut CEP Host */

function __ccTrim(str) {
  return String(str).replace(/^\s+|\s+$/g, "");
}

function __ccEscapeString(str) {
  var s = String(str);
  var out = "";
  var i;
  var ch;
  var code;
  for (i = 0; i < s.length; i++) {
    ch = s.charAt(i);
    if (ch === "\\") {
      out += "\\\\";
    } else if (ch === "\"") {
      out += "\\\"";
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else {
      code = s.charCodeAt(i);
      if (code < 32) {
        out += "\\u" + ("0000" + code.toString(16)).slice(-4);
      } else {
        out += ch;
      }
    }
  }
  return "\"" + out + "\"";
}

function __ccToJson(val) {
  var t = typeof val;
  var parts;
  var i;
  var key;

  if (val === null || t === "undefined") {
    return "null";
  }
  if (t === "boolean") {
    return val ? "true" : "false";
  }
  if (t === "number") {
    return isFinite(val) ? String(val) : "null";
  }
  if (t === "string") {
    return __ccEscapeString(val);
  }
  if (val instanceof Array) {
    parts = [];
    for (i = 0; i < val.length; i++) {
      parts.push(__ccToJson(val[i]));
    }
    return "[" + parts.join(",") + "]";
  }
  if (t === "object") {
    parts = [];
    for (key in val) {
      if (val.hasOwnProperty(key) && typeof val[key] !== "function" && typeof val[key] !== "undefined") {
        parts.push(__ccEscapeString(key) + ":" + __ccToJson(val[key]));
      }
    }
    return "{" + parts.join(",") + "}";
  }
  return "null";
}

function __ccOk(data) {
  return __ccToJson({ ok: true, data: data });
}

function __ccErr(message, code) {
  return __ccToJson({
    ok: false,
    error: String(message || "ExtendScript host error"),
    code: code ? String(code) : "HOST_ERROR"
  });
}
