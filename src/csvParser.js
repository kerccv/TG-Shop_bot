import csvParser from "csv-parser";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import { logger, mapColumn } from "./utils.js";

// Словарь синонимов для парсера CSV
const columnSynonyms = {
  name: ["name", "title", "product_name", "item", "название", "имя", "продукт", "товар"],
  price: ["price", "cost", "value", "цена", "стоимость"],
  description: ["description", "desc", "info", "details", "описание", "информация", "детали"],
  image_url: ["image", "img", "photo", "picture", "url", "image_url", "изображение", "фото", "ссылка"],
  category: ["category", "type", "group", "категория", "тип", "группа"],
  stock: ["stock", "quantity", "qty", "available", "остаток", "количество", "в_наличии"],
  tags: ["tags", "labels", "keywords", "теги", "метки", "ключевые_слова"],
};

// Парсинг CSV
export const parseCSV = async (fileUrl) => {
  const response = await fetch(fileUrl, { timeout: 5000 });
  const buffer = await response.buffer();

  const newProducts = [];
  let columnMapping = {};

  return new Promise((resolve, reject) => {
    buffer
      .pipe(csvParser())
      .on("headers", (headers) => {
        columnMapping = headers.reduce((acc, header) => {
          const field = mapColumn(header);
          if (field) acc[field] = header;
          return acc;
        }, {});
      })
      .on("data", (row) => {
        const product = {
          id: uuidv4(),
          name: columnMapping.name ? row[columnMapping.name] || "Без названия" : "Без названия",
          price: columnMapping.price && !isNaN(parseFloat(row[columnMapping.price]))
            ? parseFloat(row[columnMapping.price])
            : 0,
          description: columnMapping.description ? row[columnMapping.description] || "" : "",
          image_url: columnMapping.image_url ? row[columnMapping.image_url] || "" : "",
          category: columnMapping.category ? row[columnMapping.category] || "Без категории" : "Без категории",
          stock: columnMapping.stock && !isNaN(parseInt(row[columnMapping.stock]))
            ? parseInt(row[columnMapping.stock])
            : 0,
          tags: columnMapping.tags && row[columnMapping.tags]
            ? row[columnMapping.tags].split(/[;,\s]+/).filter((tag) => tag)
            : [],
          is_visible: false,
        };
        newProducts.push(product);
      })
      .on("end", () => {
        logger.info("CSV parsing completed", { productCount: newProducts.length });
        resolve(newProducts);
      })
      .on("error", (err) => {
        logger.error("Error parsing CSV", { error: err.message });
        reject(err);
      });
  });
};

// Экспорт словаря синонимов для использования в других модулях
export { columnSynonyms };