// 浏览器定位：只用来给门店按距离排序，拿不到位置时返回 null 由调用方走兜底
export function locate({ timeout = 5000 } = {}) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          longitude: Number(position.coords.longitude.toFixed(6)),
          latitude: Number(position.coords.latitude.toFixed(6)),
        }),
      () => resolve(null),
      { timeout, maximumAge: 300000 }
    )
  })
}
