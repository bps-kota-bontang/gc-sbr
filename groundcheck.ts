import * as fs from "fs";
import puppeteer from "puppeteer";
import Fuse from "fuse.js";
import dotenv from "dotenv";
import { randomInt } from "crypto";

// Load environment variables from .env file
dotenv.config();

// TODO: Perbarui Cookie dan Token secara berkala
// Cookie dan token ini akan kadaluarsa setelah beberapa waktu
// Untuk mendapatkan yang baru:
// 1. Buka https://matchapro.web.bps.go.id/dirgc di browser
// 2. Login ke sistem
// 3. Buka Developer Tools (F12) → Network tab
// 4. Lakukan POST request ke endpoint data-gc-card
// 5. Copy seluruh cookie dari Request Headers
// 6. Copy nilai dari XSRF-TOKEN (sudah di-decode) atau _token dari form data

// Load environment variables
// Bun automatically loads .env file
const COOKIE = process.env.COOKIE || "";
const TOKEN = process.env.TOKEN || "";
const INITIAL_GC_TOKEN = process.env.INITIAL_GC_TOKEN || "";
const ID_PROVINSI = parseInt(process.env.ID_PROVINSI || "128");
const ID_KABUPATEN = parseInt(process.env.ID_KABUPATEN || "2526");
const CITY = process.env.CITY || "Bontang";

console.log("🚀 Starting Groundcheck Script");
console.log("=".repeat(50));
console.log(
  `🏙️  Target Location: ${CITY} (Provinsi ID: ${ID_PROVINSI}, Kabupaten ID: ${ID_KABUPATEN})`,
);
console.log("=".repeat(50));

// Validasi environment variables
if (!COOKIE || !TOKEN) {
  console.error("❌ ERROR: Environment variables tidak lengkap!");
  console.error("Pastikan file .env sudah dibuat dan berisi:");
  console.error("  - COOKIE");
  console.error("  - TOKEN");
  console.error("\nCopy dari .env.example dan isi dengan nilai yang sesuai.");
  process.exit(1);
}

// Direktori untuk hasil output
const RESULT_DIR = "result";

// Pastikan direktori result ada
if (!fs.existsSync(RESULT_DIR)) {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
}

/**
 * Mengambil gc_token dari halaman direktori usaha
 * Digunakan ketika token expired dan perlu refresh
 * @returns gc_token string atau null jika gagal
 */
async function fetchGcTokenFromPage(): Promise<string | null> {
  try {
    const response = await fetch("https://matchapro.web.bps.go.id/dirgc", {
      headers: {
        accept: "*/*",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",

        // CIRI WEBVIEW ANDROID
        "user-agent":
          "Mozilla/5.0 (Linux; Android 13; Pixel 6 Build/TQ3A.230805.001) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36 wv",

        // Capacitor default behaviour
        "x-requested-with": "com.matchapro.app",

        // biasanya mobile
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',

        cookie: COOKIE,
      },
    });

    if (!response.ok) {
      console.error("❌ Failed to fetch page:", response.statusText);
      return null;
    }

    const html = await response.text();

    // Extract gcSubmitToken from JavaScript code
    // Pattern: let gcSubmitToken = 'TOKEN_VALUE';
    const tokenMatch = html.match(/let\s+gcSubmitToken\s*=\s*['"]([^'"]+)['"]/);

    if (tokenMatch && tokenMatch[1]) {
      const token = tokenMatch[1];
      console.log("✅ Successfully extracted gc_token from page:", token);
      return token;
    }

    console.error("❌ Could not find gcSubmitToken in page HTML");
    return null;
  } catch (error) {
    console.error("❌ Error fetching gc_token from page:", error);
    return null;
  }
}

const hasilgcLabels: Record<number, string> = {
  0: "Tidak ditemukan",
  1: "Ditemukan",
  3: "Tutup",
  4: "Ganda",
};

const getDirektoriUsaha = async (
  start: number,
  limit: number,
  hasLatLong?: boolean,
) => {
  // Gunakan URLSearchParams untuk membuat body URL-encoded
  const params = new URLSearchParams();
  params.append("_token", TOKEN);
  params.append("start", start.toString());
  params.append("length", limit.toString());
  params.append("nama_usaha", "");
  params.append("alamat_usaha", "");
  params.append("provinsi", ID_PROVINSI.toString());
  params.append("kabupaten", ID_KABUPATEN.toString());
  params.append("kecamatan", "");
  params.append("desa", "");
  params.append("status_filter", "aktif");
  params.append("rtotal", hasLatLong ? "10933" : "21977");
  params.append("sumber_data", "");
  params.append("skala_usaha", "");
  params.append("idsbr", "");
  params.append("history_profiling", "");
  params.append("f_latlong", hasLatLong ? "ADA" : "TIDAK");
  params.append("f_gc", "");

  const response = await fetch(
    "https://matchapro.web.bps.go.id/direktori-usaha/data-gc-card",
    {
      headers: {
        accept: "*/*",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",

        // CIRI WEBVIEW ANDROID
        "user-agent":
          "Mozilla/5.0 (Linux; Android 13; Pixel 6 Build/TQ3A.230805.001) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36 wv",

        // Capacitor default behaviour
        "x-requested-with": "com.matchapro.app",

        // biasanya mobile
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',

        Referer: "https://matchapro.web.bps.go.id/dirgc",
        cookie: COOKIE,
      },
      body: params.toString(),
      method: "POST",
    },
  );

  console.log("Response status:", response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to fetch data:", response.statusText);
    console.error("Error details:", errorText);

    if (response.status === 419) {
      console.error("\n⚠️  ERROR 419: CSRF Token Mismatch");
      console.error("Solusi:");
      console.error("1. Buka https://matchapro.web.bps.go.id/dirgc di browser");
      console.error("2. Login ke sistem");
      console.error("3. Buka Developer Tools (F12) → Network tab");
      console.error("4. Lakukan request POST ke endpoint yang sama");
      console.error("5. Copy cookie terbaru dari Request Headers");
      console.error(
        "6. Copy _token dari Form Data atau decode XSRF-TOKEN dari cookie",
      );
      console.error("7. Update variabel COOKIE dan TOKEN di file ini\n");
    }

    return null;
  }

  const data = await response.json();
  return data;
};

async function getLatLngFromMaps(
  nama_usaha: string,
): Promise<{ lat: number | null; lng: number | null; hasilgc: number }> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(
      nama_usaha,
    )}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2" });

    // Tunggu URL berubah ke detail tempat
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const url = page.url();

    console.log("Current URL:", url);

    // URL biasanya mengandung @lat,lng,zoomz
    const match = url.match(/@(-?\\d+\\.\\d+),(-?\\d+\\.\\d+),/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      await browser.close();
      return { lat, lng, hasilgc: 1 }; // 1 = Ditemukan
    }
    await browser.close();
    return { lat: null, lng: null, hasilgc: 0 }; // 0 = Tidak ditemukan
  } catch (e) {
    await browser.close();
    return { lat: null, lng: null, hasilgc: 0 };
  }
}

/**
 * Calculate similarity between input and Google Maps result using Fuse.js
 * @returns score 0-100 (100 = perfect match, 0 = no match)
 */
function calculateSimilarityWithFuse(
  inputNama: string,
  inputAlamat: string | undefined,
  gmapsNama: string,
  gmapsAlamat: string,
): number {
  // Config Fuse.js untuk matching
  const fuseOptions = {
    includeScore: true,
    threshold: 0.6, // 0 = perfect match, 1 = accept anything
    ignoreLocation: true,
    keys: [
      { name: "nama", weight: 0.7 }, // Nama 70% weight
      { name: "alamat", weight: 0.3 }, // Alamat 30% weight
    ],
  };

  // Data to search
  const searchTarget = [
    {
      nama: gmapsNama,
      alamat: gmapsAlamat,
    },
  ];

  // Create Fuse instance
  const fuse = new Fuse(searchTarget, fuseOptions);

  // Search
  const searchQuery = {
    $and: [
      { nama: inputNama },
      ...(inputAlamat ? [{ alamat: inputAlamat }] : []),
    ],
  };

  // Simple search with concatenated string (more reliable)
  const combinedInput = inputAlamat ? `${inputNama} ${inputAlamat}` : inputNama;
  const combinedTarget = `${gmapsNama} ${gmapsAlamat}`;

  // Create simple fuse for combined string
  const simpleFuse = new Fuse([combinedTarget], {
    includeScore: true,
    threshold: 0.6,
    ignoreLocation: true,
  });

  const result = simpleFuse.search(combinedInput);

  if (result.length > 0 && result[0].score !== undefined) {
    // Convert Fuse score (0=perfect, 1=worst) to percentage (100=perfect, 0=worst)
    const fuseScore = result[0].score;
    const percentage = (1 - fuseScore) * 100;
    return percentage;
  }

  return 0; // No match
}

/**
 * Mengambil latitude dan longitude dari Google Maps berdasarkan nama usaha menggunakan Puppeteer
 * @param nama_usaha string
 * @param alamat_usaha string (optional, untuk matching)
 * @returns { lat, lng, gmaps_nama, gmaps_alamat, similarity_score, error }
 */
export async function getLatLngFromGoogleMapsPuppeteer(
  nama_usaha: string,
  alamat_usaha?: string,
): Promise<{
  lat: number | null;
  lng: number | null;
  gmaps_nama?: string;
  gmaps_alamat?: string;
  similarity_score?: number;
  error?: string;
}> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // Hanya gunakan nama usaha untuk search (alamat bisa berubah, tapi usaha masih ada)
    const searchQuery = `${nama_usaha} ${CITY}`;

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(
      searchQuery,
    )}`;

    console.log("Searching Google Maps URL:", searchUrl);

    await page.goto(searchUrl, { waitUntil: "networkidle2" });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Cek apakah sudah langsung ke detail (1 hasil)
    let url = page.url();

    console.log("Current URL after search:", url);

    // Hanya ambil koordinat jika sudah di halaman detail (/place/)
    // Bukan dari halaman search yang menampilkan banyak hasil
    const isDetailPage = url.includes("/place/");

    if (isDetailPage) {
      console.log("✅ Direct match found (single result)");

      // Extract nama dan alamat dari detail page
      let gmapsNama = "";
      let gmapsAlamat = "";

      try {
        const namaElement = await page.$("h1.DUwDvf");
        if (namaElement) {
          gmapsNama = await page.evaluate((el) => el.textContent, namaElement);
        }

        const alamatElement = await page.$('button[data-item-id="address"]');
        if (alamatElement) {
          gmapsAlamat = await page.evaluate(
            (el) => el.textContent,
            alamatElement,
          );
        }
      } catch (e) {
        console.log("⚠️ Could not extract name/address:", e.message);
      }

      // Coba pattern yang lebih akurat dulu: !3d{lat}!4d{lng}
      let match = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);

      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        console.log(`Koordinat akurat ditemukan: ${lat}, ${lng}`);
        await browser.close();
        return { lat, lng, gmaps_nama: gmapsNama, gmaps_alamat: gmapsAlamat };
      }

      // Fallback ke pattern lama: @{lat},{lng}
      match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        console.log(`Koordinat ditemukan (fallback): ${lat}, ${lng}`);
        await browser.close();
        return { lat, lng, gmaps_nama: gmapsNama, gmaps_alamat: gmapsAlamat };
      }
    } else {
      console.log("Multiple results detected, checking for best match...");
    }

    // Jika belum ke detail, ambil beberapa hasil dan cari yang paling cocok
    try {
      console.log("Waiting for search results...");

      const selector = 'div[role="article"]';
      await page.waitForSelector(selector, { timeout: 8000 });

      // Ambil 5 hasil pertama untuk di-compare
      const results = await page.$$(selector);
      const topResults = results.slice(0, 5);

      console.log(`📋 Found ${topResults.length} results to compare`);

      let bestMatch = null;
      let bestScore = 0;
      let bestIndex = -1;

      // Extract info dari setiap hasil dan hitung similarity
      for (let i = 0; i < topResults.length; i++) {
        try {
          const result = topResults[i];

          // Extract nama dari heading
          const namaElement = await result.$(".qBF1Pd");
          const gmapsNama = namaElement
            ? await page.evaluate((el) => el.textContent, namaElement)
            : "";

          // Extract alamat dari div dengan class yang mengandung alamat
          const alamatElement = await result.$(".W4Efsd");
          const gmapsAlamat = alamatElement
            ? await page.evaluate((el) => el.textContent, alamatElement)
            : "";

          console.log(
            `  [${i + 1}] ${gmapsNama?.substring(
              0,
              40,
            )} - ${gmapsAlamat?.substring(0, 40)}`,
          );

          // Calculate similarity using Fuse.js
          const totalScore = calculateSimilarityWithFuse(
            nama_usaha,
            alamat_usaha,
            gmapsNama,
            gmapsAlamat,
          );

          console.log(`      Similarity: ${totalScore.toFixed(1)}% (Fuse.js)`);

          if (totalScore > bestScore) {
            bestScore = totalScore;
            bestMatch = { result, gmapsNama, gmapsAlamat };
            bestIndex = i;
          }
        } catch (err) {
          console.log(`  [${i + 1}] ⚠️ Error extracting info: ${err.message}`);
        }
      }

      // Threshold minimum 40% similarity
      if (bestMatch && bestScore >= 40) {
        console.log(
          `✅ Best match: [${bestIndex + 1}] with score ${bestScore.toFixed(
            1,
          )}%`,
        );
        console.log(`   Nama: ${bestMatch.gmapsNama}`);
        console.log(`   Alamat: ${bestMatch.gmapsAlamat}`);

        // Klik hasil terbaik
        const linkElement = await bestMatch.result.$('a[href*="/maps/place/"]');
        if (linkElement) {
          await linkElement.click();
          await new Promise((resolve) => setTimeout(resolve, 5000));
          url = page.url();

          console.log("URL after clicking best match:", url);

          console.log("URL after clicking best match:", url);

          // Validasi lokasi harus di Bontang
          console.log(`🔍 Validating location is in ${CITY}...`);
          let addressText = "";
          try {
            await page.waitForSelector('button[data-item-id="address"]', {
              timeout: 5000,
            });
            const addressButton = await page.$(
              'button[data-item-id="address"]',
            );

            if (addressButton) {
              addressText = await page.evaluate(
                (el) => el.textContent,
                addressButton,
              );
              console.log(`📍 Address found: ${addressText}`);

              if (!addressText.toLowerCase().includes(CITY.toLowerCase())) {
                console.log(`❌ Location is NOT in ${CITY}, skipping...`);
                await browser.close();
                return {
                  lat: null,
                  lng: null,
                  error: `Lokasi bukan di ${CITY}`,
                };
              }

              console.log(`✅ Location verified in ${CITY}`);
            } else {
              console.log(
                "⚠️ Address element not found, proceeding without validation",
              );
            }
          } catch (e) {
            console.log("⚠️ Could not validate address:", e.message);
          }

          // Extract koordinat
          let match = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
          if (match) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            console.log(
              `✅ Koordinat ditemukan: ${lat}, ${lng} (similarity: ${bestScore.toFixed(
                1,
              )}%)`,
            );
            await browser.close();
            return {
              lat,
              lng,
              gmaps_nama: bestMatch.gmapsNama,
              gmaps_alamat: addressText || bestMatch.gmapsAlamat,
              similarity_score: bestScore,
            };
          }

          // Fallback pattern
          match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
          if (match) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            console.log(
              `✅ Koordinat ditemukan (fallback): ${lat}, ${lng} (similarity: ${bestScore.toFixed(
                1,
              )}%)`,
            );
            await browser.close();
            return {
              lat,
              lng,
              gmaps_nama: bestMatch.gmapsNama,
              gmaps_alamat: addressText || bestMatch.gmapsAlamat,
              similarity_score: bestScore,
            };
          }
        }
      } else {
        console.log(
          `❌ No good match found. Best score: ${bestScore.toFixed(
            1,
          )}% (threshold: 40%)`,
        );
        await browser.close();
        return {
          lat: null,
          lng: null,
          error: `Tidak ada hasil yang cocok (best score: ${bestScore.toFixed(
            1,
          )}%)`,
        };
      }
    } catch (clickError) {
      console.log("Error while processing results:", clickError);
    }

    await browser.close();
    return { lat: null, lng: null, error: "Tidak ditemukan koordinat" };
  } catch (e) {
    console.error("Error in getLatLngFromGoogleMapsPuppeteer:", e);
    await browser.close();
    return { lat: null, lng: null };
  }
}

/**
 * Mengambil koordinat dari Google Maps berdasarkan ALAMAT saja (untuk retry gagal)
 * @param alamat_usaha string - alamat yang akan dicari
 * @param nama_usaha string - nama usaha untuk similarity matching (optional)
 * @returns { lat, lng, gmaps_nama, gmaps_alamat, similarity_score, error }
 */
export async function getLatLngFromAddressOnly(
  alamat_usaha: string,
  nama_usaha?: string,
): Promise<{
  lat: number | null;
  lng: number | null;
  gmaps_nama?: string;
  gmaps_alamat?: string;
  similarity_score?: number;
  error?: string;
}> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // Gunakan alamat + kota untuk search
    const searchQuery = `${alamat_usaha}, ${CITY}`;

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(
      searchQuery,
    )}`;

    console.log("🔍 Searching by address:", searchQuery);

    await page.goto(searchUrl, { waitUntil: "networkidle2" });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    let url = page.url();
    console.log("Current URL:", url);

    const isDetailPage = url.includes("/place/");

    if (isDetailPage) {
      console.log("✅ Direct match found (single result)");

      // Extract nama dan alamat dari detail page
      let gmapsNama = "";
      let gmapsAlamat = "";

      try {
        const namaElement = await page.$("h1.DUwDvf");
        if (namaElement) {
          gmapsNama = await page.evaluate((el) => el.textContent, namaElement);
        }

        const alamatElement = await page.$('button[data-item-id="address"]');
        if (alamatElement) {
          gmapsAlamat = await page.evaluate(
            (el) => el.textContent,
            alamatElement,
          );
        }
      } catch (e) {
        console.log("⚠️ Could not extract name/address:", e.message);
      }

      // Calculate similarity jika nama_usaha diberikan
      let similarityScore = 100; // Default 100 untuk direct match
      if (nama_usaha) {
        similarityScore = calculateSimilarityWithFuse(
          nama_usaha,
          alamat_usaha,
          gmapsNama,
          gmapsAlamat,
        );
        console.log(`   Similarity: ${similarityScore.toFixed(1)}%`);
      }

      // Extract koordinat dari URL
      let match = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);

      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        console.log(`📍 Koordinat ditemukan: ${lat}, ${lng}`);
        await browser.close();
        return {
          lat,
          lng,
          gmaps_nama: gmapsNama,
          gmaps_alamat: gmapsAlamat,
          similarity_score: similarityScore,
        };
      }

      // Fallback pattern
      match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        console.log(`📍 Koordinat ditemukan (fallback): ${lat}, ${lng}`);
        await browser.close();
        return {
          lat,
          lng,
          gmaps_nama: gmapsNama,
          gmaps_alamat: gmapsAlamat,
          similarity_score: similarityScore,
        };
      }
    } else {
      console.log("Multiple results detected, checking for best match...");

      try {
        console.log("Waiting for search results...");

        const selector = 'div[role="article"]';
        await page.waitForSelector(selector, { timeout: 8000 });

        // Ambil 5 hasil pertama untuk di-compare
        const results = await page.$$(selector);
        const topResults = results.slice(0, 5);

        console.log(`📋 Found ${topResults.length} results to compare`);

        let bestMatch = null;
        let bestScore = 0;
        let bestIndex = -1;

        // Extract info dari setiap hasil dan hitung similarity
        for (let i = 0; i < topResults.length; i++) {
          try {
            const result = topResults[i];

            // Extract nama dari heading
            const namaElement = await result.$(".qBF1Pd");
            const gmapsNama = namaElement
              ? await page.evaluate((el) => el.textContent, namaElement)
              : "";

            // Extract alamat
            const alamatElement = await result.$(".W4Efsd");
            const gmapsAlamat = alamatElement
              ? await page.evaluate((el) => el.textContent, alamatElement)
              : "";

            console.log(
              `  [${i + 1}] ${gmapsNama?.substring(
                0,
                40,
              )} - ${gmapsAlamat?.substring(0, 40)}`,
            );

            // Calculate similarity
            let totalScore = 0;
            if (nama_usaha) {
              // Jika ada nama usaha, gunakan untuk similarity
              totalScore = calculateSimilarityWithFuse(
                nama_usaha,
                alamat_usaha,
                gmapsNama,
                gmapsAlamat,
              );
            } else {
              // Jika tidak ada nama usaha, hanya compare alamat
              totalScore = calculateSimilarityWithFuse(
                "",
                alamat_usaha,
                "",
                gmapsAlamat,
              );
            }

            console.log(`      Similarity: ${totalScore.toFixed(1)}%`);

            if (totalScore > bestScore) {
              bestScore = totalScore;
              bestMatch = { result, gmapsNama, gmapsAlamat };
              bestIndex = i;
            }
          } catch (err) {
            console.log(
              `  [${i + 1}] ⚠️ Error extracting info: ${err.message}`,
            );
          }
        }

        // Threshold minimum 40% similarity
        if (bestMatch && bestScore >= 40) {
          console.log(
            `✅ Best match: [${bestIndex + 1}] with score ${bestScore.toFixed(
              1,
            )}%`,
          );
          console.log(`   Nama: ${bestMatch.gmapsNama}`);
          console.log(`   Alamat: ${bestMatch.gmapsAlamat}`);

          // Klik hasil terbaik
          const linkElement = await bestMatch.result.$(
            'a[href*="/maps/place/"]',
          );
          if (linkElement) {
            await linkElement.click();
            await new Promise((resolve) => setTimeout(resolve, 5000));
            url = page.url();

            console.log("URL after clicking best match:", url);

            // Validasi lokasi harus di Bontang
            console.log(`🔍 Validating location is in ${CITY}...`);
            let addressText = "";
            try {
              await page.waitForSelector('button[data-item-id="address"]', {
                timeout: 5000,
              });
              const addressButton = await page.$(
                'button[data-item-id="address"]',
              );

              if (addressButton) {
                addressText = await page.evaluate(
                  (el) => el.textContent,
                  addressButton,
                );
                console.log(`📍 Address found: ${addressText}`);

                if (!addressText.toLowerCase().includes(CITY.toLowerCase())) {
                  console.log(`❌ Location is NOT in ${CITY}, skipping...`);
                  await browser.close();
                  return {
                    lat: null,
                    lng: null,
                    error: `Lokasi bukan di ${CITY}`,
                  };
                }

                console.log(`✅ Location verified in ${CITY}`);
              }
            } catch (e) {
              console.log("⚠️ Could not validate address:", e.message);
            }

            // Extract koordinat
            let match = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
            if (match) {
              const lat = parseFloat(match[1]);
              const lng = parseFloat(match[2]);
              console.log(
                `✅ Koordinat ditemukan: ${lat}, ${lng} (similarity: ${bestScore.toFixed(
                  1,
                )}%)`,
              );
              await browser.close();
              return {
                lat,
                lng,
                gmaps_nama: bestMatch.gmapsNama,
                gmaps_alamat: addressText || bestMatch.gmapsAlamat,
                similarity_score: bestScore,
              };
            }

            // Fallback pattern
            match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
            if (match) {
              const lat = parseFloat(match[1]);
              const lng = parseFloat(match[2]);
              console.log(
                `✅ Koordinat ditemukan (fallback): ${lat}, ${lng} (similarity: ${bestScore.toFixed(
                  1,
                )}%)`,
              );
              await browser.close();
              return {
                lat,
                lng,
                gmaps_nama: bestMatch.gmapsNama,
                gmaps_alamat: addressText || bestMatch.gmapsAlamat,
                similarity_score: bestScore,
              };
            }
          }
        } else {
          console.log(
            `❌ No good match found. Best score: ${bestScore.toFixed(
              1,
            )}% (threshold: 40%)`,
          );
          await browser.close();
          return {
            lat: null,
            lng: null,
            error: `Tidak ada hasil yang cocok (best score: ${bestScore.toFixed(
              1,
            )}%)`,
          };
        }
      } catch (searchError) {
        console.log("Error while processing results:", searchError);
      }
    }

    await browser.close();
    return {
      lat: null,
      lng: null,
      error: "Lokasi tidak ditemukan dari alamat",
    };
  } catch (e) {
    console.error("Error in getLatLngFromAddressOnly:", e);
    await browser.close();
    return { lat: null, lng: null, error: e.message };
  }
}

const exportDirektoriUsaha = async (
  outputFile: string,
  hasLatLong?: boolean,
) => {
  const LIMIT_PER_REQUEST = 1000; // Ambil 1000 data per request

  // Ambil response pertama untuk mendapatkan total records
  console.log("🔍 Mengambil informasi total records...");
  const firstResponse = await getDirektoriUsaha(0, 1, hasLatLong);

  if (!firstResponse || !firstResponse.recordsTotal) {
    console.error("❌ Gagal mengambil informasi total records.");
    return;
  }

  const TOTAL_RECORDS = firstResponse.recordsTotal;
  console.log(`📊 Total records tersedia: ${TOTAL_RECORDS}\n`);

  let allData: any[] = [];
  let currentStart = 0;

  console.log(`🚀 Mulai mengambil ${TOTAL_RECORDS} data...`);
  console.log(`📦 Menggunakan batch size: ${LIMIT_PER_REQUEST} per request\n`);

  while (currentStart < TOTAL_RECORDS) {
    const remainingRecords = TOTAL_RECORDS - currentStart;
    const currentLimit = Math.min(LIMIT_PER_REQUEST, remainingRecords);

    console.log(
      `📥 Mengambil data ${currentStart + 1} - ${
        currentStart + currentLimit
      } dari ${TOTAL_RECORDS}...`,
    );

    const response = await getDirektoriUsaha(
      currentStart,
      currentLimit,
      hasLatLong,
    );

    if (!response || !response.data) {
      console.error("❌ Gagal mengambil data. Menghentikan proses.");
      break;
    }

    allData = allData.concat(response.data);
    console.log(`✅ Berhasil mengambil ${response.data.length} data`);
    console.log(
      `📊 Total data terkumpul: ${allData.length}/${TOTAL_RECORDS}\n`,
    );

    currentStart += currentLimit;

    // Delay 500ms untuk menghindari rate limiting
    if (currentStart < TOTAL_RECORDS) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Simpan ke file JSON
  const result = {
    metadata: {
      total_records: TOTAL_RECORDS,
      records_fetched: allData.length,
      timestamp: new Date().toISOString(),
      provinsi: ID_PROVINSI,
      kabupaten: ID_KABUPATEN,
    },
    data: allData,
  };

  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf-8");

  console.log(`\n✅ Selesai! Data berhasil disimpan ke: ${outputFile}`);
  console.log(`📊 Total data yang disimpan: ${allData.length} records`);
};

const viewDirektoriUsaha = () => {
  const OUTPUT_FILE = `${RESULT_DIR}/direktori_usaha.json`;

  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error(`❌ File ${OUTPUT_FILE} tidak ditemukan!`);
    console.log(
      `💡 Jalankan dulu: exportDirektoriUsaha() untuk mengambil data`,
    );
    return;
  }

  const fileContent = fs.readFileSync(OUTPUT_FILE, "utf-8");
  const jsonData = JSON.parse(fileContent);

  console.log("\n" + "=".repeat(80));
  console.log("📋 INFORMASI DATA DIREKTORI USAHA");
  console.log("=".repeat(80));
  console.log(`📅 Timestamp        : ${jsonData.metadata.timestamp}`);
  console.log(`📊 Total Records    : ${jsonData.metadata.total_records}`);
  console.log(`✅ Records Fetched  : ${jsonData.metadata.records_fetched}`);
  console.log(`🗺️  Provinsi ID     : ${jsonData.metadata.provinsi}`);
  console.log(`🏘️  Kabupaten ID    : ${jsonData.metadata.kabupaten}`);
  console.log("=".repeat(80));

  console.log("\n📦 CONTOH 5 DATA PERTAMA:");
  console.log("=".repeat(80));

  jsonData.data.slice(0, 5).forEach((item: any, index: number) => {
    console.log(`\n[${index + 1}] IDSBR: ${item.idsbr}`);
    console.log(`    Nama Usaha    : ${item.nama_usaha}`);
    console.log(`    Alamat        : ${item.alamat_usaha}`);
    console.log(`    Provinsi      : ${item.nmprov}`);
    console.log(`    Kabupaten     : ${item.nmkab}`);
    console.log(`    Kecamatan     : ${item.nmkec || "-"}`);
    console.log(`    Desa          : ${item.nmdesa || "-"}`);
    console.log(`    Skala Usaha   : ${item.skala_usaha}`);
    console.log(`    Status        : ${item.status_perusahaan}`);
    console.log(
      `    Lat/Long      : ${item.latitude || "N/A"} / ${
        item.longitude || "N/A"
      }`,
    );
  });

  console.log("\n" + "=".repeat(80));
  console.log(`📁 File lengkap tersimpan di: ${OUTPUT_FILE}`);
  console.log("=".repeat(80) + "\n");
};

/**
 * Periksa data usaha berdasarkan idsbr
 * @param idsbr string | number
 * @returns detail data usaha atau pesan tidak ditemukan
 */
const checkDirektoriUsaha = (idsbr: string | number): void => {
  const OUTPUT_FILE = `${RESULT_DIR}/direktori_usaha.json`;
  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error(`❌ File ${OUTPUT_FILE} tidak ditemukan!`);
    return;
  }
  const fileContent = fs.readFileSync(OUTPUT_FILE, "utf-8");
  const jsonData = JSON.parse(fileContent);
  const usaha = jsonData.data.find((item: any) => item.idsbr == idsbr);
  if (!usaha) {
    console.log(`❌ Data usaha dengan IDSBR ${idsbr} tidak ditemukan.`);
    return;
  }
  console.log("\n" + "=".repeat(60));
  console.log(`✅ Periksa Data Usaha IDSBR: ${idsbr}`);
  console.log("=".repeat(60));
  console.log(`Nama Usaha    : ${usaha.nama_usaha}`);
  console.log(`Alamat Usaha  : ${usaha.alamat_usaha}`);
  console.log(`Provinsi      : ${usaha.nmprov}`);
  console.log(`Kabupaten     : ${usaha.nmkab}`);
  console.log(`Kecamatan     : ${usaha.nmkec || "-"}`);
  console.log(`Desa          : ${usaha.nmdesa || "-"}`);
  console.log(`Skala Usaha   : ${usaha.skala_usaha}`);
  console.log(`Status        : ${usaha.status_perusahaan}`);
  console.log(
    `Lat/Long      : ${usaha.latitude || "N/A"} / ${usaha.longitude || "N/A"}`,
  );
  console.log("=".repeat(60) + "\n");
};

/**
 * Geocode semua data usaha dari file JSON menggunakan Puppeteer
 * Simpan hasil sukses dan gagal ke file terpisah
 * @param concurrency Jumlah parallel request (default: 5)
 */
const geocodeAllDirektoriUsaha = async (concurrency: number = 5) => {
  const INPUT_FILE = `${RESULT_DIR}/direktori_usaha.json`;
  const OUTPUT_SUCCESS = `${RESULT_DIR}/hasil_geocoding_sukses.json`;
  const OUTPUT_FAILED = `${RESULT_DIR}/hasil_geocoding_gagal.json`;

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ File ${INPUT_FILE} tidak ditemukan!`);
    return;
  }

  const fileContent = fs.readFileSync(INPUT_FILE, "utf-8");
  const jsonData = JSON.parse(fileContent);
  const allData = jsonData.data;

  console.log(`🚀 Mulai geocoding untuk ${allData.length} data usaha...`);
  console.log(`⚡ Parallel processing: ${concurrency} concurrent requests\n`);

  const successResults: any[] = [];
  const failedResults: any[] = [];
  let processedCount = 0;

  // Helper function untuk save progress ke file
  const saveProgress = () => {
    fs.writeFileSync(
      OUTPUT_SUCCESS,
      JSON.stringify(
        {
          metadata: {
            total: successResults.length,
            processed: processedCount,
            timestamp: new Date().toISOString(),
          },
          data: successResults,
        },
        null,
        2,
      ),
      "utf-8",
    );

    fs.writeFileSync(
      OUTPUT_FAILED,
      JSON.stringify(
        {
          metadata: {
            total: failedResults.length,
            processed: processedCount,
            timestamp: new Date().toISOString(),
          },
          data: failedResults,
        },
        null,
        2,
      ),
      "utf-8",
    );
  };

  // Helper function untuk process batch dengan concurrency limit
  const processBatch = async (batch: any[]) => {
    const promises = batch.map(async (usaha) => {
      const { idsbr, perusahaan_id, nama_usaha, alamat_usaha, sumber_data } =
        usaha;

      try {
        const result = await getLatLngFromGoogleMapsPuppeteer(
          nama_usaha,
          alamat_usaha,
        );

        processedCount++;
        const progress = `[${processedCount}/${allData.length}]`;

        if (result.lat && result.lng) {
          const successData = {
            idsbr,
            perusahaan_id,
            nama_usaha,
            alamat_usaha,
            sumber_data,
            gmaps_nama: result.gmaps_nama || "",
            gmaps_alamat: result.gmaps_alamat || "",
            similarity_score: result.similarity_score || 100,
            latitude: result.lat,
            longitude: result.lng,
            hasilgc: 1,
          };
          successResults.push(successData);
          console.log(
            `${progress} ✅ ${nama_usaha.substring(0, 40)}... → ${
              result.lat
            }, ${result.lng} (match: ${
              result.similarity_score?.toFixed(1) || 100
            }%)`,
          );
          return { success: true, data: successData };
        } else {
          const failedData = {
            idsbr,
            perusahaan_id,
            nama_usaha,
            alamat_usaha,
            sumber_data,
            latitude: null,
            longitude: null,
            hasilgc: 0,
            error: result.error || "Tidak ditemukan",
          };
          failedResults.push(failedData);
          console.log(
            `${progress} ❌ ${nama_usaha.substring(0, 40)}... → ${
              result.error || "Gagal"
            }`,
          );
          return { success: false, data: failedData };
        }
      } catch (error) {
        processedCount++;
        const progress = `[${processedCount}/${allData.length}]`;
        const failedData = {
          idsbr,
          perusahaan_id,
          nama_usaha,
          alamat_usaha,
          sumber_data,
          latitude: null,
          longitude: null,
          hasilgc: 0,
          error: error.message,
        };
        failedResults.push(failedData);
        console.log(
          `${progress} ❌ ${nama_usaha.substring(0, 40)}... → Error: ${
            error.message
          }`,
        );
        return { success: false, data: failedData };
      }
    });

    return await Promise.allSettled(promises);
  };

  // Process data in batches dengan concurrency limit
  for (let i = 0; i < allData.length; i += concurrency) {
    const batch = allData.slice(i, i + concurrency);
    await processBatch(batch);

    // Save progress setelah setiap batch selesai
    saveProgress();
    console.log(
      `💾 Progress saved: ${successResults.length} sukses, ${failedResults.length} gagal\n`,
    );

    // Small delay between batches
    if (i + concurrency < allData.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Final save
  saveProgress();

  console.log("\n" + "=".repeat(60));
  console.log("✅ GEOCODING SELESAI");
  console.log("=".repeat(60));
  console.log(`📊 Total data         : ${allData.length}`);
  console.log(`✅ Berhasil           : ${successResults.length}`);
  console.log(`❌ Gagal              : ${failedResults.length}`);
  console.log(`📁 File sukses        : ${OUTPUT_SUCCESS}`);
  console.log(`📁 File gagal         : ${OUTPUT_FAILED}`);
  console.log("=".repeat(60) + "\n");
};

/**
 * Retry geocoding untuk data yang gagal menggunakan ALAMAT saja
 * Membaca dari hasil_geocoding_gagal.json dan mencoba lagi dengan alamat
 */
const retryGeocodeFailedByAddress = async (concurrency: number = 5) => {
  const INPUT_FILE = `${RESULT_DIR}/hasil_geocoding_gagal.json`;
  const OUTPUT_SUCCESS = `${RESULT_DIR}/hasil_geocoding_sukses.json`;
  const OUTPUT_RETRY_SUCCESS = `${RESULT_DIR}/hasil_retry_sukses.json`;
  const OUTPUT_RETRY_FAILED = `${RESULT_DIR}/hasil_retry_gagal.json`;

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ File ${INPUT_FILE} tidak ditemukan!`);
    console.log(
      `💡 Jalankan dulu: geocode-all untuk menghasilkan file tersebut`,
    );
    return;
  }

  const fileContent = fs.readFileSync(INPUT_FILE, "utf-8");
  const jsonData = JSON.parse(fileContent);
  const failedData = jsonData.data;

  console.log(
    `🔄 Retry geocoding untuk ${failedData.length} data yang gagal...`,
  );
  console.log(`🔍 Strategi: Menggunakan ALAMAT saja (tanpa nama usaha)`);
  console.log(`⚡ Parallel processing: ${concurrency} concurrent requests\n`);

  const retrySuccessResults: any[] = [];
  const retryFailedResults: any[] = [];
  let processedCount = 0;

  // Load existing success results untuk di-append
  let existingSuccessResults: any[] = [];
  if (fs.existsSync(OUTPUT_SUCCESS)) {
    const existingContent = fs.readFileSync(OUTPUT_SUCCESS, "utf-8");
    const existingData = JSON.parse(existingContent);
    existingSuccessResults = existingData.data || [];
  }

  // Helper function untuk save progress
  const saveProgress = () => {
    // Save retry success (new file)
    fs.writeFileSync(
      OUTPUT_RETRY_SUCCESS,
      JSON.stringify(
        {
          metadata: {
            total: retrySuccessResults.length,
            processed: processedCount,
            timestamp: new Date().toISOString(),
            note: "Hasil retry geocoding menggunakan alamat saja",
          },
          data: retrySuccessResults,
        },
        null,
        2,
      ),
      "utf-8",
    );

    // Save retry failed
    fs.writeFileSync(
      OUTPUT_RETRY_FAILED,
      JSON.stringify(
        {
          metadata: {
            total: retryFailedResults.length,
            processed: processedCount,
            timestamp: new Date().toISOString(),
          },
          data: retryFailedResults,
        },
        null,
        2,
      ),
      "utf-8",
    );

    // Update main success file dengan menambahkan hasil retry yang berhasil
    if (retrySuccessResults.length > 0) {
      const combinedSuccess = [
        ...existingSuccessResults,
        ...retrySuccessResults,
      ];
      fs.writeFileSync(
        OUTPUT_SUCCESS,
        JSON.stringify(
          {
            metadata: {
              total: combinedSuccess.length,
              timestamp: new Date().toISOString(),
            },
            data: combinedSuccess,
          },
          null,
          2,
        ),
        "utf-8",
      );
    }
  };

  // Helper function untuk process batch
  const processBatch = async (batch: any[]) => {
    const promises = batch.map(async (usaha) => {
      const { idsbr, perusahaan_id, nama_usaha, alamat_usaha, sumber_data } =
        usaha;

      try {
        // Gunakan fungsi baru yang pakai alamat + nama untuk similarity
        const result = await getLatLngFromAddressOnly(alamat_usaha, nama_usaha);

        processedCount++;
        const progress = `[${processedCount}/${failedData.length}]`;

        if (result.lat && result.lng) {
          const successData = {
            idsbr,
            perusahaan_id,
            nama_usaha,
            alamat_usaha,
            sumber_data,
            gmaps_nama: result.gmaps_nama || "",
            gmaps_alamat: result.gmaps_alamat || "",
            similarity_score: result.similarity_score || 100,
            latitude: result.lat,
            longitude: result.lng,
            hasilgc: 1, // Set sebagai "Ditemukan"
            geocode_method: "address_only", // Tandai bahwa ini dari retry dengan alamat
          };
          retrySuccessResults.push(successData);
          console.log(
            `${progress} ✅ ${nama_usaha.substring(0, 40)}... → ${
              result.lat
            }, ${result.lng} (match: ${
              result.similarity_score?.toFixed(1) || 100
            }%) [by address]`,
          );
          return { success: true, data: successData };
        } else {
          const failedData = {
            idsbr,
            perusahaan_id,
            nama_usaha,
            alamat_usaha,
            sumber_data,
            latitude: null,
            longitude: null,
            hasilgc: 0,
            error: result.error || "Tidak ditemukan (alamat)",
          };
          retryFailedResults.push(failedData);
          console.log(
            `${progress} ❌ ${nama_usaha.substring(0, 40)}... → ${
              result.error || "Gagal"
            }`,
          );
          return { success: false, data: failedData };
        }
      } catch (error) {
        processedCount++;
        const progress = `[${processedCount}/${failedData.length}]`;
        const failed = {
          idsbr,
          perusahaan_id,
          nama_usaha,
          alamat_usaha,
          sumber_data,
          latitude: null,
          longitude: null,
          hasilgc: 0,
          error: error.message,
        };
        retryFailedResults.push(failed);
        console.log(
          `${progress} ❌ ${nama_usaha.substring(0, 40)}... → Error: ${
            error.message
          }`,
        );
        return { success: false, data: failed };
      }
    });

    return await Promise.allSettled(promises);
  };

  // Process data in batches
  for (let i = 0; i < failedData.length; i += concurrency) {
    const batch = failedData.slice(i, i + concurrency);
    await processBatch(batch);

    // Save progress setelah setiap batch
    saveProgress();
    console.log(
      `💾 Progress saved: ${retrySuccessResults.length} sukses, ${retryFailedResults.length} gagal\n`,
    );

    // Small delay between batches
    if (i + concurrency < failedData.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Final save
  saveProgress();

  console.log("\n" + "=".repeat(60));
  console.log("✅ RETRY GEOCODING SELESAI");
  console.log("=".repeat(60));
  console.log(`📊 Total data retry   : ${failedData.length}`);
  console.log(`✅ Berhasil           : ${retrySuccessResults.length}`);
  console.log(`❌ Tetap gagal        : ${retryFailedResults.length}`);
  console.log(`📁 File retry sukses  : ${OUTPUT_RETRY_SUCCESS}`);
  console.log(`📁 File retry gagal   : ${OUTPUT_RETRY_FAILED}`);
  console.log(
    `📁 File sukses update : ${OUTPUT_SUCCESS} (${
      existingSuccessResults.length + retrySuccessResults.length
    } total)`,
  );
  console.log("=".repeat(60) + "\n");
};

/**
 * Kirim konfirmasi direktori usaha ke server
 * @param perusahaan_id string | number
 * @param latitude number
 * @param longitude number
 * @param hasilgc number (1=valid, 0=invalid)
 * @returns Promise<boolean> true if success, false if failed
 */
const sendConfirmation = async (
  perusahaan_id: string | number,
  latitude: number,
  longitude: number,
  hasilgc: number,
  gcToken: string,
  isEdit?: boolean,
): Promise<{ success: boolean; message: string }> => {
  const params = new URLSearchParams();
  const durationTimeOnPage = randomInt(30, 60); // seconds
  params.append("perusahaan_id", perusahaan_id.toString());
  params.append("latitude", latitude.toString());
  params.append("longitude", longitude.toString());
  params.append("hasilgc", hasilgc.toString());
  params.append("gc_token", gcToken);
  params.append("_token", TOKEN);
  params.append("time_on_page", durationTimeOnPage.toString());
  if (isEdit) {
    params.append("edit_nama", "0");
    params.append("edit_alamat", "0");
    params.append("nama_usaha", "");
    params.append("alamat_usaha", "");
  }

  if (!(hasilgc in hasilgcLabels)) {
    return {
      success: false,
      message: `hasilgc harus salah satu dari: 0 (Tidak ditemukan), 1 (Ditemukan), 3 (Tutup), 4 (Ganda)`,
    };
  }

  try {
    const response = await fetch(
      "https://matchapro.web.bps.go.id/dirgc/konfirmasi-user",
      {
        headers: {
          accept: "*/*",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",

          // CIRI WEBVIEW ANDROID
          "user-agent":
            "Mozilla/5.0 (Linux; Android 13; Pixel 6 Build/TQ3A.230805.001) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36 wv",

          // Capacitor default behaviour
          "x-requested-with": "com.matchapro.app",

          // biasanya mobile
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"Android"',

          Referer: "https://matchapro.web.bps.go.id/dirgc",
          cookie: COOKIE,
        },
        body: params.toString(),
        method: "POST",
      },
    );

    const resultText = await response.text();
    if (!response.ok) {
      return {
        success: false,
        message: `${response.status}: ${resultText.substring(0, 100)}`,
        newGcToken: null,
      };
    }

    // Parse response untuk mendapatkan new_gc_token
    try {
      const jsonResponse = JSON.parse(resultText);
      return {
        success: true,
        message: jsonResponse.message || resultText,
        newGcToken: jsonResponse.new_gc_token || null,
      };
    } catch (e) {
      return { success: true, message: resultText, newGcToken: null };
    }
  } catch (error) {
    return { success: false, message: error.message, newGcToken: null };
  }
};

/**
 * Konfirmasi batch menggunakan file direktori_usaha_latlong.json
 * Mengirim konfirmasi ke server dengan hasilgc default = 1
 */
const confirmFromLatLong = async (): Promise<void> => {
  const INPUT_FILE = `${RESULT_DIR}/direktori_usaha_latlong.json`;
  const OUTPUT_SUCCESS = `${RESULT_DIR}/hasil_confirm_latlong_sukses.json`;
  const OUTPUT_FAILED = `${RESULT_DIR}/hasil_confirm_latlong_gagal.json`;

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ File ${INPUT_FILE} tidak ditemukan!`);
    console.log(`💡 Jalankan dulu: export-latlong untuk membuat file tersebut`);
    return;
  }

  const fileContent = fs.readFileSync(INPUT_FILE, "utf-8");
  const jsonData = JSON.parse(fileContent);
  const allData = jsonData.data || jsonData;

  if (!allData || allData.length === 0) {
    console.log("⚠️ Tidak ada data untuk dikonfirmasi.");
    return;
  }

  // Load existing results jika ada
  let successResults: any[] = [];
  let failedResults: any[] = [];

  if (fs.existsSync(OUTPUT_SUCCESS)) {
    const successContent = fs.readFileSync(OUTPUT_SUCCESS, "utf-8");
    const successJson = JSON.parse(successContent);
    successResults = successJson.data || [];
  }

  if (fs.existsSync(OUTPUT_FAILED)) {
    const failedContent = fs.readFileSync(OUTPUT_FAILED, "utf-8");
    const failedJson = JSON.parse(failedContent);
    failedResults = failedJson.data || [];
  }

  const confirmedIds = new Set(
    successResults.map((item) => item.perusahaan_id.toString()),
  );

  console.log("\n" + "=".repeat(60));
  console.log(`🚀 KONFIRMASI DARI ${INPUT_FILE}`);
  console.log("=".repeat(60));
  console.log(`📊 Total data: ${allData.length}`);
  console.log(`✅ Sudah sukses: ${successResults.length}`);
  console.log(`❌ Sudah gagal: ${failedResults.length}`);
  console.log(`⏭️  Akan di-skip: ${confirmedIds.size}`);
  console.log(`🔑 Menggunakan gc_token chaining (sequential)`);
  console.log("=".repeat(60) + "\n");

  const saveResults = () => {
    fs.writeFileSync(
      OUTPUT_SUCCESS,
      JSON.stringify(
        {
          metadata: {
            total: successResults.length,
            timestamp: new Date().toISOString(),
            source: INPUT_FILE,
          },
          data: successResults,
        },
        null,
        2,
      ),
      "utf-8",
    );

    fs.writeFileSync(
      OUTPUT_FAILED,
      JSON.stringify(
        {
          metadata: {
            total: failedResults.length,
            timestamp: new Date().toISOString(),
            source: INPUT_FILE,
          },
          data: failedResults,
        },
        null,
        2,
      ),
      "utf-8",
    );
  };

  const isServerDownError = (errorMessage: string): boolean => {
    const downPatterns = [
      "socket connection was closed",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "fetch failed",
      "network error",
    ];
    return downPatterns.some((pattern) =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase()),
    );
  };

  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;
  const WAIT_TIME_ON_DOWN = 15000; // 15 detik
  let currentGcToken = INITIAL_GC_TOKEN;
  let skippedCount = 0;

  // Adaptive delay
  let currentDelay = 2000;
  const MIN_DELAY = 2000;
  const MAX_DELAY = 5000;
  let consecutiveSuccesses = 0;

  for (let i = 0; i < allData.length; i++) {
    const usaha = allData[i];
    const { idsbr, perusahaan_id, nama_usaha } = usaha;
    const latitude = Number(usaha.latitude);
    const longitude = Number(usaha.longitude);
    const progress = `[${i + 1}/${allData.length}]`;

    if (!perusahaan_id || isNaN(latitude) || isNaN(longitude)) {
      failedResults.push({
        idsbr,
        perusahaan_id,
        nama_usaha,
        latitude: usaha.latitude,
        longitude: usaha.longitude,
        error: "Missing atau invalid perusahaan_id/latitude/longitude",
        failed_at: new Date().toISOString(),
      });
      console.log(
        `${progress} ❌ Skipped (invalid data): ${idsbr} ${nama_usaha}`,
      );
      saveResults();
      continue;
    }

    if (confirmedIds.has(perusahaan_id.toString())) {
      skippedCount++;
      console.log(
        `${progress} ⏭️  ${nama_usaha?.substring(0, 40) || perusahaan_id}... → Already confirmed (skipped)`,
      );
      continue;
    }

    console.log(
      `${progress} Konfirmasi: ${nama_usaha?.substring(0, 50) || perusahaan_id}...`,
    );
    console.log(`   🔑 Using gc_token: ${currentGcToken.substring(0, 20)}...`);

    const hasilgc = 1; // default per user request

    let result = await sendConfirmation(
      perusahaan_id,
      latitude,
      longitude,
      hasilgc,
      currentGcToken,
      true,
    );

    // Jika token invalid, coba refresh
    if (
      !result.success &&
      result.message.includes("Token invalid atau sudah terpakai")
    ) {
      console.log(`   ⚠️  Token expired! Mengambil token baru dari halaman...`);
      const newToken = await fetchGcTokenFromPage();
      if (newToken) {
        currentGcToken = newToken;
        result = await sendConfirmation(
          perusahaan_id,
          latitude,
          longitude,
          hasilgc,
          currentGcToken,
          true,
        );
      } else {
        console.log(
          `   ❌ Gagal mengambil token baru! Melanjutkan dengan token lama...`,
        );
      }
    }

    if (result.success) {
      consecutiveFailures = 0;
      consecutiveSuccesses++;

      if (result.newGcToken) {
        currentGcToken = result.newGcToken;
      }
      const successData = {
        idsbr,
        perusahaan_id,
        nama_usaha,
        latitude,
        longitude,
        hasilgc,
        confirmed_at: new Date().toISOString(),
      };
      successResults.push(successData);
      confirmedIds.add(perusahaan_id.toString());
      console.log(
        `${progress} ✅ ${nama_usaha?.substring(0, 40) || perusahaan_id}... → Sukses (${hasilgcLabels[hasilgc] || hasilgc})`,
      );

      if (consecutiveSuccesses >= 15 && currentDelay > MIN_DELAY) {
        currentDelay = Math.max(MIN_DELAY, currentDelay - 200);
        consecutiveSuccesses = 0;
        console.log(`   ⚡ Delay dikurangi menjadi ${currentDelay}ms`);
      }

      if (successResults.length % 10 === 0) {
        saveResults();
        console.log(
          `   💾 Progress saved: ${successResults.length} sukses, ${failedResults.length} gagal, ${skippedCount} skipped\n`,
        );
      }
    } else {
      const isRateLimited =
        result.message.includes("429") ||
        result.message.toLowerCase().includes("terlalu cepat") ||
        result.message.toLowerCase().includes("rate limit") ||
        result.message.toLowerCase().includes("Server sedang sibuk");
      if (isRateLimited && currentDelay < MAX_DELAY) {
        const oldDelay = currentDelay;
        currentDelay = Math.min(MAX_DELAY, currentDelay + 500);
        console.log(
          `   ⚠️  Rate limit detected! Meningkatkan delay dari ${oldDelay}ms → ${currentDelay}ms`,
        );
        console.log(`   ⏳ Menunggu ${currentDelay / 1000} detik...\n`);
        await new Promise((resolve) => setTimeout(resolve, currentDelay));

        console.log(`   🔄 Retry konfirmasi...`);
        result = await sendConfirmation(
          perusahaan_id,
          latitude,
          longitude,
          hasilgc,
          currentGcToken,
          true,
        );
      }

      failedResults.push({
        idsbr,
        perusahaan_id,
        nama_usaha,
        latitude,
        longitude,
        hasilgc,
        error: result.message,
        failed_at: new Date().toISOString(),
      });
      console.log(
        `${progress} ❌ ${nama_usaha?.substring(0, 40) || perusahaan_id}... → ${result.message}`,
      );
      saveResults();

      // Check if server is down
      if (
        isServerDownError(result.message) &&
        consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
      ) {
        console.log("\n" + "⚠️ ".repeat(30));
        console.log(
          `🔴 SERVER TERDETEKSI DOWN (${consecutiveFailures} kegagalan berturut-turut)`,
        );
        console.log(`⏳ Menunggu ${WAIT_TIME_ON_DOWN / 1000} detik...`);
        console.log("⚠️ ".repeat(30) + "\n");

        await new Promise((resolve) => setTimeout(resolve, WAIT_TIME_ON_DOWN));
        consecutiveFailures = 0;
        console.log("🔄 Melanjutkan proses...\n");
      }
    }

    console.log(
      `   ⏳ Menunggu ${currentDelay / 1000} detik sebelum request berikutnya...\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, currentDelay));
  }

  // Final save
  saveResults();

  console.log("\n" + "=".repeat(60));
  console.log("📊 HASIL KONFIRMASI DARI LATLONG");
  console.log(`📊 Total data: ${allData.length}`);
  console.log(`✅ Sukses: ${successResults.length}`);
  console.log(`❌ Gagal: ${failedResults.length}`);
  console.log(`⏭️  Skipped (already confirmed): ${skippedCount}`);
  console.log(`📁 File sukses: ${OUTPUT_SUCCESS}`);
  console.log(`📁 File gagal: ${OUTPUT_FAILED}`);
  console.log(`🔑 Final gc_token: ${currentGcToken.substring(0, 20)}...`);
  console.log("=".repeat(60) + "\n");
};

/**
 * Kirim konfirmasi data usaha (wrapper untuk backward compatibility)
 */
const confirmDirektoriUsaha = async (
  idsbr: string | number,
  latitude: number,
  longitude: number,
  hasilgc: number,
): Promise<void> => {
  const OUTPUT_FILE = `${RESULT_DIR}/direktori_usaha.json`;
  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error(`❌ File ${OUTPUT_FILE} tidak ditemukan!`);
    return;
  }
  const fileContent = fs.readFileSync(OUTPUT_FILE, "utf-8");
  const jsonData = JSON.parse(fileContent);
  const usaha = jsonData.data.find((item: any) => item.idsbr == idsbr);
  if (!usaha) {
    console.log(`❌ Data usaha dengan IDSBR ${idsbr} tidak ditemukan.`);
    return;
  }
  const perusahaan_id = usaha.perusahaan_id;

  const result = await sendConfirmation(
    perusahaan_id,
    latitude,
    longitude,
    hasilgc,
    INITIAL_GC_TOKEN,
  );

  if (result.success) {
    console.log("✅ Konfirmasi berhasil!");
    console.log(`Hasil GC: ${hasilgc} (${hasilgcLabels[hasilgc]})`);
    console.log("Response:", result.message);
    if (result.newGcToken) {
      console.log("🔑 New GC Token:", result.newGcToken);
    }
  } else {
    console.error("❌ Gagal konfirmasi:", result.message);
  }
};

/**
 * Kirim konfirmasi batch dari file hasil_geocoding_sukses.json
 * Menggunakan sequential processing dengan gc_token chaining
 */
const confirmFromGeocodeSuccess = async (): Promise<void> => {
  const INPUT_FILE = `${RESULT_DIR}/hasil_geocoding_sukses.json`;
  const OUTPUT_SUCCESS = `${RESULT_DIR}/hasil_confirm_sukses.json`;
  const OUTPUT_FAILED = `${RESULT_DIR}/hasil_confirm_gagal.json`;

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ File ${INPUT_FILE} tidak ditemukan!`);
    console.log(
      `💡 Jalankan dulu: geocode-all untuk menghasilkan file tersebut`,
    );
    return;
  }

  const fileContent = fs.readFileSync(INPUT_FILE, "utf-8");
  const jsonData = JSON.parse(fileContent);
  const allData = jsonData.data;

  if (!allData || allData.length === 0) {
    console.log("⚠️ Tidak ada data untuk dikonfirmasi.");
    return;
  }

  // Load existing results jika ada
  let successResults: any[] = [];
  let failedResults: any[] = [];

  if (fs.existsSync(OUTPUT_SUCCESS)) {
    const successContent = fs.readFileSync(OUTPUT_SUCCESS, "utf-8");
    const successJson = JSON.parse(successContent);
    successResults = successJson.data || [];
  }

  if (fs.existsSync(OUTPUT_FAILED)) {
    const failedContent = fs.readFileSync(OUTPUT_FAILED, "utf-8");
    const failedJson = JSON.parse(failedContent);
    failedResults = failedJson.data || [];
  }

  // Buat Set untuk tracking perusahaan_id yang sudah dikonfirmasi
  const confirmedIds = new Set(
    successResults.map((item) => item.perusahaan_id.toString()),
  );

  console.log("\n" + "=".repeat(60));
  console.log(`🚀 KONFIRMASI BATCH DARI ${INPUT_FILE}`);
  console.log("=".repeat(60));
  console.log(`📊 Total data: ${allData.length}`);
  console.log(`✅ Sudah sukses: ${successResults.length}`);
  console.log(`❌ Sudah gagal: ${failedResults.length}`);
  console.log(`⏭️  Akan di-skip: ${confirmedIds.size}`);
  console.log(`🔑 Menggunakan gc_token chaining (sequential)`);
  console.log("=".repeat(60) + "\n");

  /**
   * Helper function untuk menyimpan hasil ke file
   */
  const saveResults = () => {
    // Simpan hasil sukses
    fs.writeFileSync(
      OUTPUT_SUCCESS,
      JSON.stringify(
        {
          metadata: {
            total: successResults.length,
            timestamp: new Date().toISOString(),
            source: INPUT_FILE,
          },
          data: successResults,
        },
        null,
        2,
      ),
      "utf-8",
    );

    // Simpan hasil gagal
    fs.writeFileSync(
      OUTPUT_FAILED,
      JSON.stringify(
        {
          metadata: {
            total: failedResults.length,
            timestamp: new Date().toISOString(),
            source: INPUT_FILE,
          },
          data: failedResults,
        },
        null,
        2,
      ),
      "utf-8",
    );
  };

  /**
   * Deteksi apakah error adalah server down
   */
  const isServerDownError = (errorMessage: string): boolean => {
    const downPatterns = [
      "socket connection was closed",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "fetch failed",
      "network error",
    ];
    return downPatterns.some((pattern) =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase()),
    );
  };

  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;
  const WAIT_TIME_ON_DOWN = 15000; // 15 detik
  let currentGcToken = INITIAL_GC_TOKEN;
  let skippedCount = 0;

  // Adaptive delay untuk menghindari rate limit
  let currentDelay = 2000; // Mulai dari 2 detik
  const MIN_DELAY = 2000; // Minimal 2 detik
  const MAX_DELAY = 5000; // Maksimal 5 detik
  let consecutiveSuccesses = 0;

  // Sequential processing dengan token chaining
  for (let i = 0; i < allData.length; i++) {
    const usaha = allData[i];
    const {
      idsbr,
      perusahaan_id,
      nama_usaha,
      alamat_usaha,
      latitude,
      longitude,
      hasilgc,
      gmaps_nama,
      gmaps_alamat,
      similarity_score,
    } = usaha;

    const progress = `[${i + 1}/${allData.length}]`;

    // Cek apakah sudah pernah dikonfirmasi
    if (confirmedIds.has(perusahaan_id.toString())) {
      skippedCount++;
      console.log(
        `${progress} ⏭️  ${nama_usaha.substring(
          0,
          40,
        )}... → Already confirmed (skipped)`,
      );
      continue; // Skip ke iterasi berikutnya
    }

    console.log(`${progress} Konfirmasi: ${nama_usaha.substring(0, 50)}...`);
    console.log(`   🔑 Using gc_token: ${currentGcToken.substring(0, 20)}...`);

    let result = await sendConfirmation(
      perusahaan_id,
      latitude,
      longitude,
      hasilgc,
      currentGcToken,
    );

    // Cek jika token invalid, ambil token baru dan retry
    if (
      !result.success &&
      result.message.includes("Token invalid atau sudah terpakai")
    ) {
      console.log(`   ⚠️  Token expired! Mengambil token baru dari halaman...`);

      const newToken = await fetchGcTokenFromPage();
      if (newToken) {
        currentGcToken = newToken;
        console.log(
          `   🔑 Token baru diperoleh: ${currentGcToken.substring(0, 20)}...`,
        );
        console.log(`   🔄 Retry konfirmasi dengan token baru...`);

        // Retry dengan token baru
        result = await sendConfirmation(
          perusahaan_id,
          latitude,
          longitude,
          hasilgc,
          currentGcToken,
        );

        if (result.success) {
          console.log(`   ✅ Retry berhasil!`);
        } else {
          console.log(`   ❌ Retry gagal: ${result.message}`);
        }
      } else {
        console.log(
          `   ❌ Gagal mengambil token baru! Melanjutkan dengan token lama...`,
        );
      }
    }

    if (result.success) {
      consecutiveFailures = 0;
      consecutiveSuccesses++;

      // Update token untuk request berikutnya
      if (result.newGcToken) {
        currentGcToken = result.newGcToken;
        console.log(
          `   🔑 New gc_token received: ${currentGcToken.substring(0, 20)}...`,
        );
      }

      const successData = {
        idsbr,
        perusahaan_id,
        nama_usaha,
        alamat_usaha,
        gmaps_nama,
        gmaps_alamat,
        similarity_score,
        latitude,
        longitude,
        hasilgc,
        confirmed_at: new Date().toISOString(),
      };
      successResults.push(successData);
      confirmedIds.add(perusahaan_id.toString()); // Tambahkan ke Set
      console.log(
        `${progress} ✅ ${nama_usaha.substring(0, 40)}... → Sukses (${
          hasilgcLabels[hasilgc]
        })`,
      );

      // Turunkan delay jika sukses terus menerus (setiap 15 sukses)
      if (consecutiveSuccesses >= 15 && currentDelay > MIN_DELAY) {
        currentDelay = Math.max(MIN_DELAY, currentDelay - 200);
        consecutiveSuccesses = 0;
        console.log(`   ⚡ Delay dikurangi menjadi ${currentDelay}ms`);
      }

      // Simpan progress setiap 10 sukses
      if (successResults.length % 10 === 0) {
        saveResults();
        console.log(
          `   💾 Progress saved: ${successResults.length} sukses, ${failedResults.length} gagal, ${skippedCount} skipped\n`,
        );
      }
    } else {
      consecutiveFailures++;
      consecutiveSuccesses = 0; // Reset sukses berturut-turut

      // Cek jika terkena rate limit (429)
      const isRateLimited =
        result.message.includes("429") ||
        result.message.toLowerCase().includes("terlalu cepat") ||
        result.message.toLowerCase().includes("rate limit");

      if (isRateLimited && currentDelay < MAX_DELAY) {
        const oldDelay = currentDelay;
        currentDelay = Math.min(MAX_DELAY, currentDelay + 500);
        console.log(
          `   ⚠️  Rate limit detected! Meningkatkan delay dari ${oldDelay}ms → ${currentDelay}ms`,
        );

        // Tunggu sebentar sebelum retry
        console.log(`   ⏳ Menunggu ${currentDelay / 1000} detik...\n`);
        await new Promise((resolve) => setTimeout(resolve, currentDelay));

        // Retry dengan delay baru
        console.log(`   🔄 Retry konfirmasi...`);
        result = await sendConfirmation(
          perusahaan_id,
          latitude,
          longitude,
          hasilgc,
          currentGcToken,
        );

        // Jika retry gagal karena token invalid, refresh token dan retry lagi
        if (
          !result.success &&
          result.message.includes("Token invalid atau sudah terpakai")
        ) {
          console.log(
            `   ⚠️  Token expired setelah rate limit! Mengambil token baru...`,
          );

          const newToken = await fetchGcTokenFromPage();
          if (newToken) {
            currentGcToken = newToken;
            console.log(
              `   🔑 Token baru diperoleh: ${currentGcToken.substring(
                0,
                20,
              )}...`,
            );
            console.log(`   🔄 Retry sekali lagi dengan token baru...`);

            // Retry dengan token baru
            result = await sendConfirmation(
              perusahaan_id,
              latitude,
              longitude,
              hasilgc,
              currentGcToken,
            );

            if (result.success) {
              console.log(`   ✅ Retry dengan token baru berhasil!`);
            } else {
              console.log(
                `   ❌ Retry dengan token baru gagal: ${result.message}`,
              );
            }
          } else {
            console.log(`   ❌ Gagal mengambil token baru!`);
          }
        }

        if (result.success) {
          consecutiveFailures = 0;

          // Update token untuk request berikutnya
          if (result.newGcToken) {
            currentGcToken = result.newGcToken;
          }

          const successData = {
            idsbr,
            perusahaan_id,
            nama_usaha,
            alamat_usaha,
            gmaps_nama,
            gmaps_alamat,
            similarity_score,
            latitude,
            longitude,
            hasilgc,
            confirmed_at: new Date().toISOString(),
          };
          successResults.push(successData);
          confirmedIds.add(perusahaan_id.toString());
          console.log(
            `${progress} ✅ ${nama_usaha.substring(0, 40)}... → Sukses (${
              hasilgcLabels[hasilgc]
            }) [retry]`,
          );

          // Simpan progress setiap 10 sukses
          if (successResults.length % 10 === 0) {
            saveResults();
            console.log(
              `   💾 Progress saved: ${successResults.length} sukses, ${failedResults.length} gagal, ${skippedCount} skipped\n`,
            );
          }

          // Skip ke iterasi berikutnya karena sudah berhasil
          console.log(
            `   ⏳ Menunggu ${
              currentDelay / 1000
            } detik sebelum request berikutnya...\n`,
          );
          await new Promise((resolve) => setTimeout(resolve, currentDelay));
          continue;
        } else {
          console.log(`   ❌ Retry tetap gagal: ${result.message}`);
        }
      }

      const failedData = {
        idsbr,
        perusahaan_id,
        nama_usaha,
        alamat_usaha,
        gmaps_nama,
        gmaps_alamat,
        similarity_score,
        latitude,
        longitude,
        hasilgc,
        error: result.message,
        failed_at: new Date().toISOString(),
      };
      failedResults.push(failedData);
      console.log(
        `${progress} ❌ ${nama_usaha.substring(0, 40)}... → ${result.message}`,
      );

      // Simpan juga saat gagal
      saveResults();

      // Check if server is down
      if (
        isServerDownError(result.message) &&
        consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
      ) {
        console.log("\n" + "⚠️ ".repeat(30));
        console.log(
          `🔴 SERVER TERDETEKSI DOWN (${consecutiveFailures} kegagalan berturut-turut)`,
        );
        console.log(`⏳ Menunggu ${WAIT_TIME_ON_DOWN / 1000} detik...`);
        console.log("⚠️ ".repeat(30) + "\n");

        await new Promise((resolve) => setTimeout(resolve, WAIT_TIME_ON_DOWN));
        consecutiveFailures = 0;
        console.log("🔄 Melanjutkan proses...\n");
      }
    }

    // Adaptive delay antara request
    console.log(
      `   ⏳ Menunggu ${
        currentDelay / 1000
      } detik sebelum request berikutnya...\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, currentDelay));
  }

  // Final save
  saveResults();

  console.log("\n" + "=".repeat(60));
  console.log("📊 HASIL KONFIRMASI BATCH");
  console.log(`📊 Total data: ${allData.length}`);
  console.log(`✅ Sukses: ${successResults.length}`);
  console.log(`❌ Gagal: ${failedResults.length}`);
  console.log(`⏭️  Skipped (already confirmed): ${skippedCount}`);
  console.log(`❌ Gagal: ${failedResults.length}`);
  console.log(`📁 File sukses: ${OUTPUT_SUCCESS}`);
  console.log(`📁 File gagal: ${OUTPUT_FAILED}`);
  console.log(`🔑 Final gc_token: ${currentGcToken.substring(0, 20)}...`);
  console.log("=".repeat(60) + "\n");
};

/**
 * Update file hasil geocoding yang sudah ada dengan menambahkan sumber_data dari master
 */
const updateGeocodeFilesWithSumberData = async () => {
  const MASTER_FILE = `${RESULT_DIR}/direktori_usaha.json`;
  const SUCCESS_FILE = `${RESULT_DIR}/hasil_geocoding_sukses.json`;
  const FAILED_FILE = `${RESULT_DIR}/hasil_geocoding_gagal.json`;

  console.log("🔄 Updating geocode files with sumber_data...\n");

  // Load master data
  if (!fs.existsSync(MASTER_FILE)) {
    console.error(`❌ Master file ${MASTER_FILE} tidak ditemukan!`);
    return;
  }

  const masterContent = fs.readFileSync(MASTER_FILE, "utf-8");
  const masterData = JSON.parse(masterContent);
  const masterMap = new Map();

  // Create map untuk lookup cepat
  masterData.data.forEach((item: any) => {
    masterMap.set(item.idsbr, item.sumber_data || "");
  });

  console.log(`📋 Loaded ${masterMap.size} records from master data\n`);

  let updatedFiles = 0;
  let notFoundIds: string[] = [];

  // Update SUCCESS file
  if (fs.existsSync(SUCCESS_FILE)) {
    console.log(`📝 Updating ${SUCCESS_FILE}...`);
    const successContent = fs.readFileSync(SUCCESS_FILE, "utf-8");
    const successData = JSON.parse(successContent);

    let updatedCount = 0;
    successData.data = successData.data.map((item: any) => {
      if (!item.sumber_data) {
        const sumberData = masterMap.get(item.idsbr);
        if (sumberData) {
          updatedCount++;
          return { ...item, sumber_data: sumberData };
        } else {
          // Jika tidak ditemukan, set default "Unknown"
          notFoundIds.push(item.idsbr);
          updatedCount++;
          return { ...item, sumber_data: "Unknown" };
        }
      }
      return item;
    });

    fs.writeFileSync(
      SUCCESS_FILE,
      JSON.stringify(successData, null, 2),
      "utf-8",
    );
    console.log(`   ✅ Updated ${updatedCount} records in ${SUCCESS_FILE}`);
    updatedFiles++;
  } else {
    console.log(`   ⚠️  ${SUCCESS_FILE} not found, skipping...`);
  }

  // Update FAILED file
  if (fs.existsSync(FAILED_FILE)) {
    console.log(`📝 Updating ${FAILED_FILE}...`);
    const failedContent = fs.readFileSync(FAILED_FILE, "utf-8");
    const failedData = JSON.parse(failedContent);

    let updatedCount = 0;
    failedData.data = failedData.data.map((item: any) => {
      if (!item.sumber_data) {
        const sumberData = masterMap.get(item.idsbr);
        if (sumberData) {
          updatedCount++;
          return { ...item, sumber_data: sumberData };
        } else {
          // Jika tidak ditemukan, set default "Unknown"
          if (!notFoundIds.includes(item.idsbr)) {
            notFoundIds.push(item.idsbr);
          }
          updatedCount++;
          return { ...item, sumber_data: "Unknown" };
        }
      }
      return item;
    });

    fs.writeFileSync(FAILED_FILE, JSON.stringify(failedData, null, 2), "utf-8");
    console.log(`   ✅ Updated ${updatedCount} records in ${FAILED_FILE}`);
    updatedFiles++;
  } else {
    console.log(`   ⚠️  ${FAILED_FILE} not found, skipping...`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ UPDATE SELESAI");
  console.log(`📁 Files updated: ${updatedFiles}`);
  if (notFoundIds.length > 0) {
    console.log(`⚠️  IDSBR not found in master: ${notFoundIds.length}`);
    console.log(
      `   (Set to "Unknown": ${notFoundIds.slice(0, 5).join(", ")}${
        notFoundIds.length > 5 ? "..." : ""
      })`,
    );
  }
  console.log("=".repeat(60) + "\n");
};

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "export") {
    console.log("🚀 Memulai export data...\n");
    await exportDirektoriUsaha(`${RESULT_DIR}/direktori_usaha.json`);
  } else if (command === "export-latlong") {
    console.log("🚀 Memulai export data dengan latlong...\n");
    await exportDirektoriUsaha(
      `${RESULT_DIR}/direktori_usaha_latlong.json`,
      true,
    );
  } else if (command === "view") {
    console.log("👀 Melihat data dari file JSON...\n");
    viewDirektoriUsaha();
  } else if (command === "check" && args[1]) {
    console.log(`🔎 Periksa data usaha dengan IDSBR: ${args[1]}\n`);
    checkDirektoriUsaha(args[1]);
  } else if (command === "confirm" && args.length >= 5) {
    const idsbr = args[1];
    const latitude = parseFloat(args[2]);
    const longitude = parseFloat(args[3]);
    const hasilgc = parseInt(args[4]);
    if (![0, 1, 3, 4].includes(hasilgc)) {
      console.error(
        `❌ hasilgc harus salah satu dari: 0 (Tidak ditemukan), 1 (Ditemukan), 3 (Tutup), 4 (Ganda)`,
      );
      return;
    }
    console.log(
      `🌐 Mengirim konfirmasi untuk IDSBR: ${idsbr} (Hasil GC: ${hasilgc} - ${hasilgcLabels[hasilgc]})`,
    );
    await confirmDirektoriUsaha(idsbr, latitude, longitude, hasilgc);
  } else if (command === "confirm-batch") {
    console.log("🌐 Memulai konfirmasi batch dari hasil geocoding...\n");
    await confirmFromGeocodeSuccess();
  } else if (command === "confirm-latlong") {
    console.log(
      "🌐 Memulai konfirmasi dari direktori_usaha_latlong.json (hasilgc=1)...\n",
    );
    await confirmFromLatLong();
  } else if (command === "geocode-all") {
    const concurrency = args[1] ? parseInt(args[1]) : 5;
    console.log("🌍 Memulai batch geocoding untuk semua data usaha...");
    console.log(`⚡ Concurrency: ${concurrency} parallel requests\n`);
    await geocodeAllDirektoriUsaha(concurrency);
  } else if (command === "retry-geocode") {
    const concurrency = args[1] ? parseInt(args[1]) : 5;
    console.log("🔄 Retry geocoding untuk data yang gagal...");
    console.log(`🔍 Menggunakan ALAMAT saja (bukan nama usaha)`);
    console.log(`⚡ Concurrency: ${concurrency} parallel requests\n`);
    await retryGeocodeFailedByAddress(concurrency);
  } else if (command === "update-sumber-data") {
    console.log("🔄 Update file geocoding dengan sumber_data...\n");
    await updateGeocodeFilesWithSumberData();
  } else if (command === "geocode" && args[1]) {
    const nama_usaha = args.slice(1).join(" ");
    console.log(`🌍 Mencari koordinat untuk: ${nama_usaha}`);
    const result = await getLatLngFromGoogleMapsPuppeteer(nama_usaha);
    if (result.lat && result.lng) {
      console.log(
        `✅ Koordinat ditemukan: lat=${result.lat}, lng=${result.lng}`,
      );
    } else {
      console.log("❌ Koordinat tidak ditemukan.");
    }
  } else {
    console.log("📖 CARA PENGGUNAAN:");
    console.log("=".repeat(50));
    console.log("1. Export data dari API:");
    console.log("   npx tsx groundcheck.ts export");
    console.log(
      "\n1.1 Export data dengan koordinat (lat,long) untuk analisis/spasial:",
    );
    console.log("   npx tsx groundcheck.ts export-latlong");
    console.log(
      "   Output: CSV/JSON berisi kolom: id, nama, latitude, longitude — gunakan untuk analisis spasial atau visualisasi di GIS",
    );
    console.log("\n2. Lihat data dari file JSON:");
    console.log("   npx tsx groundcheck.ts view");
    console.log("\n3. Periksa data usaha berdasarkan IDSBR:");
    console.log("   npx tsx groundcheck.ts check <idsbr>");
    console.log("\n4. Konfirmasi direktori usaha:");
    console.log(
      "   npx tsx groundcheck.ts confirm <idsbr> <latitude> <longitude> <hasilgc>",
    );
    console.log("      hasilgc:");
    console.log("        0 = Tidak ditemukan");
    console.log("        1 = Ditemukan");
    console.log("        3 = Tutup");
    console.log("        4 = Ganda");
    console.log(
      "\n5. Konfirmasi batch dari hasil geocoding (sequential dengan gc_token):",
    );
    console.log("   npx tsx groundcheck.ts confirm-batch");
    console.log(
      "   (Kirim semua data dari hasil_geocoding_sukses.json ke server)",
    );
    console.log(
      "   (Hasil disimpan ke hasil_confirm_sukses.json & hasil_confirm_gagal.json)",
    );
    console.log(
      "\n5.1 Konfirmasi dari direktori_usaha_latlong.json (hasilgc default=1):",
    );
    console.log("   npx tsx groundcheck.ts confirm-latlong");
    console.log(
      "   (Kirim konfirmasi menggunakan perusahaan_id, latitude, longitude dari direktori_usaha_latlong.json)",
    );
    console.log(
      "   (Hasil disimpan ke hasil_confirm_latlong_sukses.json & hasil_confirm_latlong_gagal.json)",
    );
    console.log("\n6. Geocode nama usaha via Google Maps:");
    console.log("   npx tsx groundcheck.ts geocode <nama_usaha>");
    console.log("\n7. Geocode semua data usaha dari file JSON (parallel):");
    console.log("   npx tsx groundcheck.ts geocode-all [concurrency]");
    console.log("   Default concurrency: 5 (optional: 1-20)");
    console.log("   Contoh: npx tsx groundcheck.ts geocode-all 10");
    console.log(
      "   (Hasil disimpan ke hasil_geocoding_sukses.json & hasil_geocoding_gagal.json)",
    );
    console.log("\n8. Retry geocode untuk data gagal menggunakan ALAMAT saja:");
    console.log("   npx tsx groundcheck.ts retry-geocode [concurrency]");
    console.log("   Default concurrency: 5");
    console.log("   Contoh: npx tsx groundcheck.ts retry-geocode 3");
    console.log(
      "   (Membaca hasil_geocoding_gagal.json, retry dengan alamat saja)",
    );
    console.log(
      "   (Hasil disimpan ke hasil_retry_sukses.json & hasil_retry_gagal.json)",
    );
    console.log("   (File hasil_geocoding_sukses.json akan di-update)");
    console.log("\n9. Update file geocoding dengan sumber_data dari master:");
    console.log("   npx tsx groundcheck.ts update-sumber-data");
    console.log(
      "   (Update hasil_geocoding_sukses.json & hasil_geocoding_gagal.json)",
    );
    console.log("   (Menambahkan field sumber_data dari direktori_usaha.json)");
    console.log("=".repeat(50));
  }
};

main();
