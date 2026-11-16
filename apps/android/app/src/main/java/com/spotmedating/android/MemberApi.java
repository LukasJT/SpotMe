package com.spotmedating.android;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class MemberApi {
    private final URL origin;
    private String cookie = "";

    MemberApi(String origin) throws IOException {
        this.origin = new URL(origin);
        if (!this.origin.getProtocol().equals("https")
                && !(BuildConfig.DEBUG && origin.equals("http://127.0.0.1:3080"))) {
            throw new IOException("Invalid SpotMe server.");
        }
    }

    static final class Failure extends IOException {
        final int status;
        final String code;
        Failure(int status, String code) { this.status = status; this.code = code; }
    }

    // All calls run on one worker thread. The session cookie stays in memory.
    JSONObject request(String path, JSONObject data) throws Exception {
        if (!path.startsWith("/") || path.startsWith("//")) throw new IOException();
        HttpURLConnection conn = (HttpURLConnection) new URL(origin, path).openConnection();
        try {
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(9000);
            conn.setReadTimeout(15000);
            conn.setUseCaches(false);
            if (!cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
            if (data != null) {
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Origin", origin.getProtocol() + "://" + origin.getHost()
                        + (origin.getPort() == -1 || origin.getPort() == origin.getDefaultPort() ? "" : ":" + origin.getPort()));
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                byte[] body = data.toString().getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(body.length);
                try (var out = conn.getOutputStream()) { out.write(body); }
            }
            int status = conn.getResponseCode();
            for (var header : conn.getHeaderFields().entrySet()) {
                if ("Set-Cookie".equalsIgnoreCase(header.getKey())) {
                    for (String value : header.getValue()) {
                        String first = value.split(";", 2)[0];
                        if (first.matches("(?:__Host-spotme|spotme_local)=(?:[0-9a-f]{64})?"))
                            cookie = first.endsWith("=") ? "" : first;
                    }
                }
            }
            try (InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream()) {
                JSONObject result = new JSONObject();
                if (stream != null) {
                    var body = new ByteArrayOutputStream();
                    byte[] buffer = new byte[4096];
                    int count;
                    while ((count = stream.read(buffer)) != -1) {
                        if (body.size() + count > 262144) throw new IOException("Response too large.");
                        body.write(buffer, 0, count);
                    }
                    if (body.size() > 0) result = new JSONObject(body.toString("UTF-8"));
                }
                if (status < 200 || status >= 300) throw new Failure(status, result.optString("error"));
                return result;
            }
        } finally { conn.disconnect(); }
    }
}
