export default function (name: string, output: string | Uint8Array) {
	const downloadUrl = URL.createObjectURL(new Blob([output]));
	const a = document.createElement('a');
	a.href = downloadUrl;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	URL.revokeObjectURL(downloadUrl);
}
