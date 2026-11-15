// Desktop-site mode reports a desktop user agent. Screen width alone cannot
// distinguish that mode from a regular mobile visit or a narrow desktop window.
const device = navigator.userAgentData;
const mobile = typeof device?.mobile === 'boolean'
  ? device.mobile
  : /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent);
document.documentElement.dataset.spotmeView = mobile ? 'mobile' : 'desktop';

if (mobile && document.documentElement.hasAttribute('data-spotme-desktop-only')) {
  location.replace(new URL('./#download', location.href));
}
