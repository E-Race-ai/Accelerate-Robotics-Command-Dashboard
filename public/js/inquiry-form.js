/**
 * Inquiry form submission handler.
 * Validates inputs, submits via fetch, and shows inline feedback.
 */
(function () {
  const form = document.getElementById('inquiryForm');
  if (!form) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  const feedback = document.getElementById('inquiryFeedback');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedback.textContent = '';
    feedback.className = 'mt-4 text-sm font-medium';

    const data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      company: form.company.value.trim(),
      phone: form.phone.value.trim(),
      message: form.message.value.trim(),
    };

    if (!data.name || !data.email || !data.message) {
      feedback.textContent = 'Please fill in all required fields.';
      feedback.classList.add('text-red-600');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (res.ok) {
        feedback.textContent = 'Thank you! We\'ll be in touch soon.';
        feedback.classList.add('text-emerald-600');
        form.reset();
      } else {
        feedback.textContent = result.error || 'Something went wrong. Please try again.';
        feedback.classList.add('text-red-600');
      }
    } catch {
      feedback.textContent = 'Network error. Please check your connection and try again.';
      feedback.classList.add('text-red-600');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Inquiry';
    }
  });
})();
