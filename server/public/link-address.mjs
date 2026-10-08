// Shared by the browser and backend so saved and published addresses agree.
export function completeLinkAddress(input) {
  const address = input.trim();
  if(/^\\\\/.test(address)) {
    const [server,...parts] = address.slice(2).split(/[\\/]/);
    return validateLinkAddress(`file://${server}/${parts.map(encodeURIComponent).join('/')}`);
  }
  if(/^[a-z]:[\\/]/i.test(address)) {
    const [drive,...parts] = address.replace(/\\/g,'/').split('/');
    return validateLinkAddress(`file:///${drive}/${parts.map(encodeURIComponent).join('/')}`);
  }
  if(!address || /^[a-z][a-z\d+.-]*:\/\//i.test(address) || /^(javascript|data|file|mailto|vbscript|about|blob):/i.test(address))return address;
  const value = address.replace(/^\/\//,'');
  const url = new URL(`https://${value}`);
  const labels = url.hostname.split('.');
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.startsWith('[');
  const isLocal = labels.length === 1 || /\.(localhost|local|lan|internal)$/i.test(url.hostname);
  const isDomain = labels.length === 2 || (labels.length === 3 && /^(com|net|org|edu|gov|mil|co|ac)$/i.test(labels[1]) && /^[a-z]{2}$/i.test(labels[2]));
  // Preserve subdomains, IP addresses and internal hosts: adding www changes their destination.
  const prefix = !isIp && !isLocal && isDomain && labels[0] !== 'www' ? 'www.' : '';
  return `https://${prefix}${value}`;
}

export function validateLinkAddress(input) {
  const address = completeLinkAddress(input);
  const url = new URL(address);
  if(url.username || url.password)throw new Error('Não inclua credenciais no endereço.');
  if(['http:','https:'].includes(url.protocol) && url.hostname)return address;
  if(url.protocol === 'file:') {
    const path = decodeURIComponent(url.pathname);
    const drive = /^\/[a-z]:\//i.test(path);
    const network = !!url.hostname && /^[a-z\d][a-z\d.-]*$/i.test(url.hostname) && /^\/[^/]+/.test(path);
    if((drive || network) && !url.search && !url.hash && !/[\x00-\x1f\x7f]/.test(path))return url.href;
    throw new Error('Informe um caminho completo, como O:\\GERAL\\arquivo.xlsx ou \\\\servidor\\pasta\\arquivo.xlsx.');
  }
  throw new Error('Use um site HTTP/HTTPS ou um caminho de arquivo ou pasta compartilhada.');
}
