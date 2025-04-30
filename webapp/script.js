(async () => {
  const res = await fetch("https://your_project.supabase.co/rest/v1/products", {
    headers: {
      apikey: "your_anon_key_here",
      Authorization: "Bearer your_anon_key_here",
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