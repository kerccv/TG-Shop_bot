
import React, { useEffect, useState } from "react";
import "./styles/main.css";

function App() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/products`, {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_KEY}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Ошибка загрузки товаров");
        return res.json();
      })
      .then(setProducts)
      .catch(console.error);
  }, []);

  const filtered = products.filter((p) =>
    p.название?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4">
      <input
        className="w-full p-2 border mb-4"
        type="text"
        placeholder="Поиск товаров..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.map((item, i) => (
          <div key={i} className="border rounded p-3 shadow">
            <img src={item.фото} alt={item.название} className="w-full h-40 object-cover mb-2" />
            <h2 className="text-lg font-bold">{item.название}</h2>
            <p>{item.описание}</p>
            <p className="font-semibold mt-2">{item.цена} ₽</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
