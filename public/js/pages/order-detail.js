const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    const paymentResult = ref(el.dataset.paymentResult || null);

    const order = ref(null);
    const loading = ref(true);
    const payingRedirect = ref(false);
    const confirming = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'border border-marigold text-marigold' },
      paid: { label: '已付款', cls: 'border border-moss text-moss' },
      failed: { label: '付款失敗', cls: 'border border-peony text-peony' },
    };

    const paymentMessages = {
      success: { text: '付款成功！感謝您的購買。', cls: 'border border-moss text-moss' },
      failed: { text: '付款失敗，請重試。', cls: 'border border-peony text-peony' },
      cancel: { text: '付款已取消。', cls: 'border border-marigold text-marigold' },
    };

    function submitEcpayForm(actionUrl, params) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = actionUrl;
      form.style.display = 'none';
      Object.entries(params).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    }

    async function goToEcpayCheckout() {
      if (!order.value || payingRedirect.value) return;
      payingRedirect.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay/checkout', { method: 'POST' });
        submitEcpayForm(res.data.action_url, res.data.params);
      } catch (e) {
        Notification.show('建立綠界付款失敗', 'error');
        payingRedirect.value = false;
      }
    }

    async function confirmEcpayPayment(options) {
      const silent = options && options.silent;
      if (!order.value || confirming.value) return;
      confirming.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay/confirm', { method: 'POST' });
        order.value = res.data;
        if (order.value.status === 'paid') {
          paymentResult.value = 'success';
        } else if (order.value.status === 'failed') {
          paymentResult.value = 'failed';
        } else if (!silent) {
          Notification.show(res.message, 'info');
        }
      } catch (e) {
        if (!silent) Notification.show('查詢付款結果失敗', 'error');
      } finally {
        confirming.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;

        // 從綠界 OrderResultURL 導回：自動查一次付款結果，不信任導回帶的任何資料
        if (paymentResult.value === 'return' && order.value.status === 'pending') {
          paymentResult.value = null;
          await confirmEcpayPayment();
          const url = new URL(window.location.href);
          url.searchParams.delete('payment');
          window.history.replaceState({}, '', url);
        }
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    return {
      order,
      loading,
      payingRedirect,
      confirming,
      paymentResult,
      statusMap,
      paymentMessages,
      goToEcpayCheckout,
      confirmEcpayPayment,
    };
  }
}).mount('#app');
