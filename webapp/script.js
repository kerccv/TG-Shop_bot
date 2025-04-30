(async () => {
  const res = await fetch("https://viwzvkqjypybmullgwke.supabase.com/rest/v1/products", {
    headers: {
      apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpd3p2a3FqeXB5Ym11bGxnd2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5NDczNDQsImV4cCI6MjA2MTUyMzM0NH0.rhoS0U4Jqv-2Fynv5FagBxpp4aZbuRWp9lJcgozIqOY",
      Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpd3p2a3FqeXB5Ym11bGxnd2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5NDczNDQsImV4cCI6MjA2MTUyMzM0NH0.rhoS0U4Jqv-2Fynv5FagBxpp4aZbuRWp9lJcgozIqOY"
    }
  });
  
  const data = await res.json();

  const root = document.getElementById("root");
  const input = document.createElement("input");
  input.placeholder = "Поиск товаров...";
  root.appendChild(input);

  const container = document.createElement("div");
  root.appendChild(container);

  function render(products) {
    container.innerHTML = "";
    products.forEach(p => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <img src="${p.фото}" style="width:100%;max-height:200px;object-fit:cover" />
        <h2>${p.название}</h2>
        <p>${p.описание}</p>
        <strong>${p.цена} ₽</strong>
      `;
      container.appendChild(card);
    });
  }

  input.addEventListener("input", () => {
    const filtered = data.filter(p =>
      p.название?.toLowerCase().includes(input.value.toLowerCase())
    );
    render(filtered);
  });

  render(data);
})();