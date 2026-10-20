(function (root) {
  'use strict';

  var units = Object.freeze([
    { id: 'pop-under', name: 'Pop Under', dimensions: 'Site-wide' },
    { id: 'smart-link', name: 'Smart Link', dimensions: 'Provider-defined' },
    { id: 'social-bar', name: 'Social Bar', dimensions: 'Provider-defined' },
    { id: 'native-banner', name: 'Native Banner', dimensions: 'Provider-defined' },
    { id: 'banner-300x250', name: 'Banner 300 × 250', dimensions: '300 × 250' },
    { id: 'banner-728x90', name: 'Banner 728 × 90', dimensions: '728 × 90' },
    { id: 'banner-320x50', name: 'Banner 320 × 50', dimensions: '320 × 50' },
    { id: 'banner-468x60', name: 'Banner 468 × 60', dimensions: '468 × 60' },
    { id: 'banner-400x60', name: 'Banner 400 × 60', dimensions: '400 × 60' },
    { id: 'banner-160x300', name: 'Banner 160 × 300', dimensions: '160 × 300' },
    { id: 'banner-160x600', name: 'Banner 160 × 600', dimensions: '160 × 600' }
  ].map(function (unit) {
    return Object.freeze(unit);
  }));

  if (typeof module !== 'undefined' && module.exports) module.exports = units;
  if (root) root.AD_UNIT_CATALOG = units;
})(typeof globalThis !== 'undefined' ? globalThis : this);
