import winston from "winston";
import { columnSynonyms } from "./csvParser.js";

// Инициализация логгера
export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

// Функция для сопоставления заголовков CSV
export const mapColumn = (header) => {
  const cleanHeader = header.toLowerCase().replace(/[_-\s]/g, "");
  for (const [field, synonyms] of Object.entries(columnSynonyms)) {
    if (synonyms.some((synonym) => cleanHeader.includes(synonym.toLowerCase()))) {
      return field;
    }
  }
  return null;
};