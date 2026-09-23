const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const productId = document.getElementById('app').dataset.productId;
    const product = ref(null);
    const loading = ref(true);
    const notFound = ref(false);
    const quantity = ref(1);
    const adding = ref(false);
    const related = ref([]);

    function decrease() {
      if (quantity.value > 1) quantity.value--;
    }

    function increase() {
      if (product.value && quantity.value < product.value.stock) quantity.value++;
    }

    async function addToCart() {
      if (!product.value || adding.value) return;
      adding.value = true;
      try {
        await apiFetch('/api/cart', {
          method: 'POST',
          body: JSON.stringify({ productId: product.value.id, quantity: quantity.value })
        });
        Notification.show('已加入購物車', 'success');
        var badge = document.getElementById('cart-badge');
        if (badge) {
          var count = parseInt(badge.textContent || '0') + 1;
          badge.textContent = count;
          badge.style.display = 'flex';
        }
      } catch (e) {
        Notification.show('加入購物車失敗', 'error');
      } finally {
        adding.value = false;
      }
    }

    async function loadRelated() {
      try {
        const res = await apiFetch('/api/products?limit=5');
        related.value = res.data.products.filter(function (p) { return p.id !== productId; }).slice(0, 3);
      } catch (e) {
        related.value = [];
      }
    }

    function goToProduct(id) {
      window.location.href = '/products/' + id;
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/products/' + productId);
        product.value = res.data;
      } catch (e) {
        notFound.value = true;
      } finally {
        loading.value = false;
      }
      loadRelated();
    });

    return { product, loading, notFound, quantity, adding, related, decrease, increase, addToCart, goToProduct };
  }
}).mount('#app');
