import type { Dictionary } from './fr';

/**
 * Arabic UI strings.
 *
 * Typed against the French dictionary, so a missing or misspelled key is a
 * compile error rather than a blank button a customer discovers.
 *
 * Note the difference from CMS content: these are shipped strings, so they must
 * be complete. The silent French fallback (D-093) applies to database content,
 * not to the interface itself.
 */
export const ar: Dictionary = {
  common: {
    loading: 'جاري التحميل',
    retry: 'إعادة المحاولة',
    close: 'إغلاق',
    back: 'رجوع',
    search: 'بحث',
    cancel: 'إلغاء',
    save: 'حفظ',
  },
  nav: {
    home: 'الرئيسية',
    shop: 'المتجر',
    newArrivals: 'وصل حديثاً',
    promotions: 'تخفيضات',
    trackOrder: 'تتبع طلبي',
    contact: 'اتصل بنا',
    menu: 'القائمة',
    cart: 'السلة',
  },
  language: {
    switch: 'اللغة',
    fr: 'Français',
    ar: 'العربية',
  },
  product: {
    addToCart: 'أضف إلى السلة',
    orderNow: 'اطلب الآن',
    orderViaWhatsapp: 'اطلب عبر واتساب',
    inStock: 'متوفر',
    lastUnits: 'بقي {count} فقط',
    outOfStock: 'نفدت الكمية',
    chooseColor: 'اللون',
    chooseSize: 'المقاس',
    sizeGuide: 'دليل المقاسات',
    care: 'العناية',
    description: 'الوصف',
    related: 'قد يعجبك أيضاً',
  },
  delivery: {
    estimate: 'سعر التوصيل',
    chooseWilaya: 'اختر الولاية',
    chooseCommune: 'اختر البلدية',
    bureau: 'مكتب',
    domicile: 'إلى المنزل',
    coverage: 'التوصيل إلى 58 ولاية',
  },
  cart: {
    title: 'السلة',
    empty: 'سلتك فارغة.',
    emptyAction: 'تصفح المتجر',
    subtotal: 'المجموع',
    deliveryFee: 'التوصيل',
    total: 'الإجمالي',
    checkout: 'إتمام الطلب',
    remove: 'حذف',
    quantity: 'الكمية',
  },
  checkout: {
    title: 'معلوماتك',
    firstName: 'الاسم',
    lastName: 'اللقب',
    phone: 'رقم الهاتف',
    address: 'العنوان',
    notes: 'ملاحظات',
    notesHint: 'اختياري',
    submit: 'تأكيد الطلب',
    payOnDelivery: 'الدفع عند الاستلام',
  },
  errors: {
    invalidPhone: 'رقم هاتف جزائري غير صحيح. مثال: 0563876210',
    requiredField: 'هذا الحقل مطلوب',
    addressRequired: 'العنوان مطلوب للتوصيل إلى المنزل',
    noDeliveryPrice: 'لا يوجد سعر توصيل محدد لهذه الولاية',
    rateLimited: 'محاولات كثيرة. أعد المحاولة بعد ساعة.',
    duplicate: 'تم تسجيل طلب بهذا الرقم للتو.',
    generic: 'تعذّر تسجيل الطلب. أعد المحاولة.',
    notFound: 'الصفحة غير موجودة',
    notFoundAction: 'العودة إلى الرئيسية',
  },
  orderStatus: {
    confirmationCall: 'سنتصل بك لتأكيد طلبك.',
    reference: 'رقم الطلب',
    trackTitle: 'تتبع طلبي',
    trackHint: 'أدخل رقم الطلب ورقم هاتفك.',
    trackNotFound: 'لا يوجد طلب مطابق لهذه المعلومات.',
  },
};
