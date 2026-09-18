import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { HttpError } from '../lib/http.js';
import { getProductWithStock } from '../lib/domain.js';

export const barcodeRouter = Router();

/**
 * Barcode-Auflösung in zwei Stufen: zuerst der eigene Artikelstamm, erst danach
 * die Open-Food-Facts-Datenbank. Der Abruf läuft bewusst über den Server – so
 * gibt es keine CORS-Probleme und die Handys im Heimnetz brauchen selbst keinen
 * Internetzugang.
 *
 * Datenschutz: bei Stufe zwei verlässt die gescannte Nummer das Heimnetz.
 * Über OFF_ENABLED=false lässt sich das komplett abschalten.
 */
barcodeRouter.get('/:code', async (req, res) => {
  const barcode = String(req.params.code).replace(/[\s-]/g, '');
  if (!/^\d{6,14}$/.test(barcode)) {
    throw HttpError.badRequest('Barcode muss aus 6 bis 14 Ziffern bestehen');
  }

  const known = db().prepare('SELECT id FROM products WHERE barcode = ?').get(barcode);
  if (known) {
    return res.json({ source: 'local', barcode, product: getProductWithStock(known.id) });
  }

  if (!config.openFoodFacts.enabled) {
    return res.json({ source: 'none', barcode, product: null, suggestion: null });
  }

  const suggestion = await lookupOpenFoodFacts(barcode);
  return res.json({ source: suggestion ? 'openfoodfacts' : 'none', barcode, product: null, suggestion });
});

async function lookupOpenFoodFacts(barcode) {
  const fields = ['product_name', 'product_name_de', 'brands', 'quantity', 'image_front_small_url'];
  const url = `${config.openFoodFacts.baseUrl}/api/v2/product/${barcode}.json?fields=${fields.join(',')}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(config.openFoodFacts.timeoutMs),
      headers: {
        // Open Food Facts verlangt eine identifizierende Kennung.
        'User-Agent': 'Warensystem-Home/1.0 (Haushalts-Warenwirtschaft)',
        Accept: 'application/json',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 1 || !data.product) return null;

    const name = data.product.product_name_de || data.product.product_name;
    if (!name) return null;

    return {
      name: String(name).trim().slice(0, 160),
      brand: data.product.brands ? String(data.product.brands).split(',')[0].trim().slice(0, 120) : null,
      package_text: data.product.quantity ?? null,
      image_url: data.product.image_front_small_url ?? null,
    };
  } catch (error) {
    // Kein Internet oder Zeitüberschreitung: der Artikel wird eben von Hand
    // angelegt – das darf den Scan nicht zum Fehler machen.
    console.warn(`[barcode] Open Food Facts nicht erreichbar (${barcode}): ${error.message}`);
    return null;
  }
}
