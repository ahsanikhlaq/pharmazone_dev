window.addEventListener("message", function(event) {
  if (event.data?.type === "VF_ADD_TO_CART") {
    const { variantId, quantity, properties } = event.data.payload;

    console.log('[Cart] Received add to cart message:', event.data.payload);

    fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: variantId,
        quantity: quantity,
        properties: properties
      })
    })
    .then(res => res.json())
    .then(data => {
      console.log('[Cart] Added to cart:', data);
      window.location.href = "/cart";
    })
    .catch(err => {
      console.error('[Cart] Error:', err);
    });
  }
});