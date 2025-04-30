const Papa = require("papaparse");
const axios = require("axios");

module.exports.parseFromUrl = async function (url, fields) {
  const response = await axios.get(url);
  const csv = response.data;
  const result = Papa.parse(csv, { header: true, skipEmptyLines: true });
  return result.data.map(row => {
    const product = {};
    fields.forEach(field => { product[field] = row[field] || ""; });
    return product;
  });
};