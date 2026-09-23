const { createApp, ref, computed, onMounted } = Vue;

const FREE_SHIPPING_THRESHOLD = 1500;
const HOME_BASE_FEE = 120;
const CONVENIENCE_FEE = 60;
const REMOTE_AREA_SURCHARGE = 200;
const EXPRESS_SURCHARGE = 250;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const loading = ref(true);
    const submitting = ref(false);
    const cartItems = ref([]);
    const form = ref({
      recipientName: '',
      recipientEmail: '',
      recipientAddress: '',
      shippingMethod: 'home',
      isRemoteArea: false,
      isExpress: false,
    });
    const errors = ref({});

    const cartTotal = computed(function () {
      return cartItems.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    const shippingFee = computed(function () {
      let fee = 0;
      if (form.value.shippingMethod === 'home') {
        if (cartTotal.value < FREE_SHIPPING_THRESHOLD) {
          fee += HOME_BASE_FEE;
        }
      } else {
        fee += CONVENIENCE_FEE;
      }
      if (form.value.isRemoteArea) fee += REMOTE_AREA_SURCHARGE;
      if (form.value.isExpress) fee += EXPRESS_SURCHARGE;
      return fee;
    });

    const orderTotal = computed(function () {
      return cartTotal.value + shippingFee.value;
    });

    function validate() {
      errors.value = {};
      if (!form.value.recipientName.trim()) errors.value.recipientName = '請輸入收件人姓名';
      if (!form.value.recipientEmail.trim()) {
        errors.value.recipientEmail = '請輸入 Email';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.recipientEmail)) {
        errors.value.recipientEmail = 'Email 格式不正確';
      }
      if (!form.value.recipientAddress.trim()) errors.value.recipientAddress = '請輸入收件地址';
      if (!form.value.shippingMethod) errors.value.shippingMethod = '請選擇配送方式';
      return Object.keys(errors.value).length === 0;
    }

    async function submitOrder() {
      if (!validate() || submitting.value) return;
      submitting.value = true;
      try {
        const res = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify(form.value)
        });
        Notification.show('訂單已建立', 'success');
        window.location.href = '/orders/' + res.data.id;
      } catch (err) {
        Notification.show(err?.data?.message || '訂單建立失敗', 'error');
      } finally {
        submitting.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/cart');
        cartItems.value = res.data.items;
        if (cartItems.value.length === 0) {
          window.location.href = '/cart';
          return;
        }
      } catch (e) {
        window.location.href = '/cart';
        return;
      }
      loading.value = false;
    });

    return {
      loading,
      submitting,
      cartItems,
      form,
      errors,
      cartTotal,
      shippingFee,
      orderTotal,
      FREE_SHIPPING_THRESHOLD,
      submitOrder,
    };
  }
}).mount('#app');
