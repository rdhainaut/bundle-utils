function loadResource(url) {
  return fetch(url).then(response => response.json())
}
