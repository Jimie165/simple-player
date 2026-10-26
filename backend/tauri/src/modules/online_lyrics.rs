//! Platform request adapters based on Lyricify Lyrics Helper's search/download flow.
use base64::{Engine, engine::general_purpose::STANDARD};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{io::Read, time::Duration};

#[derive(Clone, Serialize, Deserialize)]
pub struct Candidate {
    pub provider: String,
    pub id: String,
    #[serde(default)]
    pub numeric_id: Option<String>,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_ms: u64,
}
#[derive(Serialize)]
pub struct SearchResponse {
    pub candidates: Vec<Candidate>,
    pub errors: Vec<String>,
}
#[derive(Serialize)]
pub struct LyricsPayload {
    pub content: String,
    pub format: String,
    pub translation: Option<String>,
    pub romanization: Option<String>,
}
fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(18))
        .connect_timeout(Duration::from_secs(6))
        .user_agent("SimplePlayer/0.4 (online lyrics)")
        .build()
        .map_err(|e| e.to_string())
}
fn get(c: &Client, url: &str, params: &[(&str, &str)]) -> Result<Value, String> {
    let request = c.get(url);
    let request = if url.contains("qq.com") {
        request.header("Referer", "https://y.qq.com/")
    } else if url.contains("163.com") {
        request.header("Referer", "https://music.163.com/")
    } else {
        request
    };
    request
        .query(params)
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.json())
        .map_err(|e| e.to_string())
}
fn s(v: &Value, key: &str) -> String {
    match &v[key] {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}
fn artists(v: &Value) -> String {
    v.as_array()
        .map(|a| {
            a.iter()
                .map(|x| s(x, "name"))
                .collect::<Vec<_>>()
                .join(" / ")
        })
        .unwrap_or_default()
}
fn list(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}

fn search_text(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn amll_score(title: &str, artist: &str, keyword: &str) -> usize {
    let title = search_text(title);
    let artist = search_text(artist);
    let query = search_text(keyword);
    let terms: Vec<_> = query.split_whitespace().collect();
    if terms.is_empty() {
        return 0;
    }
    let mut score = 0;
    for term in terms {
        if title.contains(term) {
            score += 3;
        } else if artist.contains(term) {
            score += 2;
        } else {
            return 0;
        }
    }
    score + if title == query { 10 } else { 0 }
}

pub fn search(keyword: &str, provider: &str) -> Result<SearchResponse, String> {
    let keyword = keyword.trim();
    if keyword.is_empty() || keyword.len() > 500 {
        return Err("请输入有效搜索关键词".into());
    }
    let providers = ["netease", "qq", "kugou", "lrclib", "amll"];
    if provider != "all" && !providers.contains(&provider) {
        return Err("不支持的歌词来源".into());
    }
    let c = client()?;
    // Each source fails independently; one unavailable platform must not hide other results.
    let results = std::thread::scope(|scope| {
        let jobs: Vec<_> = providers
            .iter()
            .filter(|p| provider == "all" || **p == provider)
            .map(|p| {
                let c = &c;
                scope.spawn(move || (*p, search_source(c, keyword, p)))
            })
            .collect();
        jobs.into_iter()
            .filter_map(|j| j.join().ok())
            .collect::<Vec<_>>()
    });
    let mut response = SearchResponse {
        candidates: vec![],
        errors: vec![],
    };
    for (p, result) in results {
        match result {
            Ok(items) => response.candidates.extend(items),
            Err(e) => response.errors.push(format!("{p}: {e}")),
        }
    }
    Ok(response)
}
fn search_source(c: &Client, keyword: &str, provider: &str) -> Result<Vec<Candidate>, String> {
    let mut out = vec![];
    match provider {
        "netease" => {
            let v = get(
                c,
                "https://music.163.com/api/search/get/web",
                &[("s", keyword), ("type", "1"), ("limit", "30")],
            )?;
            if v["code"].as_i64() != Some(200) {
                return Err("平台拒绝搜索请求".into());
            }
            for x in list(&v["result"]["songs"]) {
                out.push(Candidate {
                    provider: provider.into(),
                    id: s(x, "id"),
                    numeric_id: None,
                    title: s(x, "name"),
                    artist: artists(&x["artists"]),
                    album: s(&x["album"], "name"),
                    duration_ms: x["duration"].as_u64().unwrap_or(0),
                });
            }
        }
        "qq" => {
            // Match Pure Music's active Lite protocol, including text/plain transport.
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            let body = json!({"comm":{"ct":"11","cv":"1003006","v":"1003006","os_ver":"15","phonetype":"24122RKC7C","tmeAppID":"qqmusiclight","nettype":"NETWORK_WIFI"},"req_0":{"module":"music.search.SearchCgiService","method":"DoSearchForQQMusicLite","param":{"query":keyword,"search_type":0,"num_per_page":30,"page_num":1,"remoteplace":"search.android.keyboard","search_id":(10000000000000000u128 + now * 123456789 % 1000000000000000).to_string(),"highlight":0,"nqc_flag":0,"page_id":1,"grp":1}}});
            let v: Value = c.post("https://u.y.qq.com/cgi-bin/musicu.fcg")
                .header("Content-Type", "text/plain; charset=utf-8")
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36")
                .body(body.to_string()).send().and_then(|r|r.error_for_status()).and_then(|r|r.json()).map_err(|e|e.to_string())?;
            let mut songs = list(&v["req_0"]["data"]["body"]["item_song"]).to_vec();
            if songs.is_empty() {
                // The Lite API may reject anonymous requests (subcode 2001).
                // The legacy search endpoint has its own response schema.
                let legacy = get(
                    c,
                    "https://c.y.qq.com/soso/fcgi-bin/client_search_cp",
                    &[("format", "json"), ("w", keyword), ("p", "1"), ("n", "30")],
                )?;
                if legacy["code"].as_i64() != Some(0) {
                    return Err(format!(
                        "QQ 搜索失败（Lite={}，备用={}）",
                        v["req_0"]["code"], legacy["code"]
                    ));
                }
                let items = legacy["data"]["song"]["list"]
                    .as_array()
                    .ok_or("QQ 返回结构异常：缺少歌曲列表")?;
                songs = items.iter().map(|x| json!({"mid":x["songmid"],"id":x["songid"],"title":x["songname"],"singer":x["singer"],"album":{"name":x["albumname"]},"interval":x["interval"]})).collect();
            }
            for x in &songs {
                out.push(Candidate {
                    provider: provider.into(),
                    id: s(x, "mid"),
                    numeric_id: Some(s(x, "id")),
                    title: s(x, "title"),
                    artist: artists(&x["singer"]),
                    album: s(&x["album"], "name"),
                    duration_ms: x["interval"].as_u64().unwrap_or(0) * 1000,
                });
            }
        }
        "kugou" => {
            let v = get(
                c,
                "http://mobilecdn.kugou.com/api/v3/search/song",
                &[
                    ("keyword", keyword),
                    ("page", "1"),
                    ("pagesize", "30"),
                    ("format", "json"),
                ],
            )?;
            for x in list(&v["data"]["info"]) {
                out.push(Candidate {
                    provider: provider.into(),
                    id: s(x, "hash"),
                    numeric_id: None,
                    title: s(x, "songname"),
                    artist: s(x, "singername"),
                    album: s(x, "album_name"),
                    duration_ms: x["duration"].as_u64().unwrap_or(0) * 1000,
                });
            }
        }
        "lrclib" => {
            let mut v = get(c, "https://lrclib.net/api/search", &[("q", keyword)])?;
            if list(&v).is_empty() {
                let clean = search_text(keyword);
                if clean != keyword {
                    v = get(c, "https://lrclib.net/api/search", &[("q", &clean)])?;
                }
            }
            for x in list(&v).iter().take(30) {
                out.push(Candidate {
                    provider: provider.into(),
                    id: s(x, "id"),
                    numeric_id: None,
                    title: s(x, "trackName"),
                    artist: s(x, "artistName"),
                    album: s(x, "albumName"),
                    duration_ms: (x["duration"].as_f64().unwrap_or(0.0) * 1000.0) as u64,
                });
            }
        }
        "amll" => {
            let text = amll_text(c, "metadata/raw-lyrics-index.jsonl")?;
            let mut scored = vec![];
            for line in text.lines() {
                let Ok(v) = serde_json::from_str::<Value>(line) else {
                    continue;
                };
                let field = |key: &str| {
                    list(&v["metadata"])
                        .iter()
                        .find(|x| x[0].as_str() == Some(key))
                        .map(|x| {
                            list(&x[1])
                                .iter()
                                .filter_map(Value::as_str)
                                .collect::<Vec<_>>()
                                .join(" / ")
                        })
                        .unwrap_or_default()
                };
                let title = field("musicName");
                let artist = field("artists");
                let score = amll_score(&title, &artist, keyword);
                if score > 0 {
                    scored.push((
                        score,
                        Candidate {
                            provider: provider.into(),
                            id: s(&v, "rawLyricFile"),
                            numeric_id: None,
                            title,
                            artist,
                            album: field("album"),
                            duration_ms: 0,
                        },
                    ));
                }
            }
            scored.sort_by_key(|item| std::cmp::Reverse(item.0));
            out.extend(scored.into_iter().take(60).map(|(_, item)| item));
        }
        _ => return Err("不支持的歌词来源".into()),
    }
    out.retain(|x| !x.id.is_empty());
    Ok(out)
}
fn amll_text(c: &Client, path: &str) -> Result<String, String> {
    let mut error = String::new();
    for base in [
        "https://amlldb.bikonoo.com",
        "https://raw.githubusercontent.com/amll-dev/amll-ttml-db/main",
    ] {
        match c
            .get(format!("{base}/{path}"))
            .send()
            .and_then(|r| r.error_for_status())
            .and_then(|r| r.text())
        {
            Ok(t) => return Ok(t),
            Err(e) => error = e.to_string(),
        }
    }
    Err(error)
}
pub fn fetch(item: &Candidate) -> Result<LyricsPayload, String> {
    if item.id.is_empty()
        || !item
            .id
            .chars()
            .all(|x| x.is_ascii_alphanumeric() || "-_.".contains(x))
        || item.id.contains("..")
    {
        return Err("无效的歌曲 ID".into());
    }
    let c = client()?;
    let mut p = LyricsPayload {
        content: String::new(),
        format: "lrc".into(),
        translation: None,
        romanization: None,
    };
    match item.provider.as_str() {
        "amll" => {
            p.content = amll_text(&c, &format!("raw-lyrics/{}", item.id))?;
            p.format = "ttml".into();
        }
        "netease" => {
            let v = get(
                &c,
                "https://music.163.com/api/song/lyric",
                &[
                    ("id", &item.id),
                    ("lv", "-1"),
                    ("yv", "-1"),
                    ("tv", "-1"),
                    ("rv", "-1"),
                ],
            )?;
            p.content = s(&v["yrc"], "lyric");
            if p.content.is_empty() {
                p.content = s(&v["lrc"], "lyric");
            } else {
                p.format = "yrc".into();
            }
            p.translation = v["tlyric"]["lyric"].as_str().map(str::to_owned);
            p.romanization = v["romalrc"]["lyric"].as_str().map(str::to_owned);
        }
        "qq" => {
            if let Some(id) = item
                .numeric_id
                .as_deref()
                .filter(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()))
                && let Ok(payload) = qq_word_lyrics(&c, id)
            {
                return Ok(payload);
            }
            let v = get(
                &c,
                "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg",
                &[("songmid", &item.id), ("format", "json"), ("nobase64", "1")],
            )?;
            p.content = s(&v, "lyric");
            p.translation = v["trans"].as_str().map(str::to_owned);
        }
        "lrclib" => {
            let v = get(&c, &format!("https://lrclib.net/api/get/{}", item.id), &[])?;
            p.content = s(&v, "syncedLyrics");
            if p.content.is_empty() {
                p.content = s(&v, "plainLyrics");
            }
        }
        "kugou" => {
            let v = get(
                &c,
                "https://lyrics.kugou.com/search",
                &[
                    ("hash", &item.id),
                    ("ver", "1"),
                    ("client", "pc"),
                    ("man", "yes"),
                ],
            )?;
            let x = list(&v["candidates"]).first().ok_or("此歌曲没有歌词")?;
            let v = get(
                &c,
                "https://lyrics.kugou.com/download",
                &[
                    ("id", &s(x, "id")),
                    ("accesskey", &s(x, "accesskey")),
                    ("fmt", "krc"),
                    ("ver", "1"),
                    ("client", "pc"),
                    ("charset", "utf8"),
                ],
            )?;
            let bytes = STANDARD
                .decode(s(&v, "content"))
                .map_err(|e| e.to_string())?;
            if bytes.len() < 4 {
                return Err("无效 KRC 数据".into());
            }
            let key = [
                64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105,
            ];
            let bytes: Vec<u8> = bytes[4..]
                .iter()
                .enumerate()
                .map(|(i, b)| b ^ key[i % 16])
                .collect();
            flate2::read::ZlibDecoder::new(bytes.as_slice())
                .take(4 * 1024 * 1024)
                .read_to_string(&mut p.content)
                .map_err(|e| e.to_string())?;
            p.format = "krc".into();
        }
        _ => return Err("不支持的歌词来源".into()),
    }
    if p.content.trim().is_empty() {
        return Err("此歌曲没有可用歌词".into());
    }
    Ok(p)
}

fn qq_word_lyrics(c: &Client, id: &str) -> Result<LyricsPayload, String> {
    let xml = c
        .get("https://c.y.qq.com/qqmusic/fcgi-bin/lyric_download.fcg")
        .header("Referer", "https://y.qq.com/")
        .query(&[
            ("version", "15"),
            ("miniversion", "82"),
            ("lrctype", "4"),
            ("musicid", id),
        ])
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
        .map_err(|e| e.to_string())?;
    let extract = |tag: &str| -> Option<String> {
        let re = regex::Regex::new(&format!(
            r"(?s)<{tag}[^>]*>\s*<!\[CDATA\[(.*?)\]\]>\s*</{tag}>"
        ))
        .ok()?;
        let raw = re.captures(&xml)?.get(1)?.as_str().trim();
        decode_qrc(raw).ok()
    };
    let re = regex::Regex::new(r"(?s)<content\s[^>]*>\s*<!\[CDATA\[(.*?)\]\]>\s*</content>")
        .map_err(|e| e.to_string())?;
    let raw = re
        .captures(&xml)
        .and_then(|c| c.get(1))
        .ok_or("没有 QRC 歌词")?;
    let content = decode_qrc(raw.as_str().trim())?;
    Ok(LyricsPayload {
        content,
        format: "qrc".into(),
        translation: extract("contentts"),
        romanization: extract("contentroma"),
    })
}

fn decode_qrc(raw: &str) -> Result<String, String> {
    if raw.starts_with('[') {
        return Ok(raw.to_owned());
    }
    if !raw.len().is_multiple_of(16) || !raw.is_ascii() {
        return Err("无效 QRC 数据".into());
    }
    let mut bytes: Vec<u8> = (0..raw.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&raw[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect::<Result<_, _>>()?;
    super::qrc_cipher::decrypt(&mut bytes);
    let mut text = String::new();
    flate2::read::ZlibDecoder::new(bytes.as_slice())
        .take(4 * 1024 * 1024)
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    if text.contains("LyricContent=") {
        let re = regex::Regex::new(r#"LyricContent="([^"]*)""#).map_err(|e| e.to_string())?;
        text = re
            .captures(&text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_owned())
            .ok_or("无效 QRC XML")?;
    }
    Ok(text
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn amll_normalizes_query_separators() {
        assert!(amll_score("Idol", "YOASOBI", "Idol / YOASOBI") > 0);
        assert!(
            amll_score(
                "37.5°Cのファンタジー",
                "スリーズブーケ",
                "37.5°Cのファンタジー - スリーズブーケ"
            ) > 0
        );
        assert_eq!(amll_score("Idol", "YOASOBI", "Unrelated"), 0);
    }

    #[test]
    fn rejects_untrusted_track_paths() {
        let item = Candidate {
            provider: "amll".into(),
            id: "../secret".into(),
            numeric_id: None,
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            duration_ms: 0,
        };
        assert!(fetch(&item).is_err());
        assert!(search("", "all").is_err());
        assert!(search("Hello", "unknown").is_err());
    }
}
