
export const useFontLoader = ( fonts:string[]) => {
    const injectFonts = (fontUrls: string[]) => {
        fontUrls.forEach((fontUrl) => {
          if (!fontUrl) return;
          const isAbsolute = /^https?:\/\//i.test(fontUrl);
          const isGoogleFonts = fontUrl.includes("fonts.googleapis");
          const base =
            typeof window !== "undefined"
              ? `${window.location.protocol}//${window.location.hostname}:5000`
              : "http://localhost:5000";

          const newFontUrl =
            isGoogleFonts || isAbsolute ? fontUrl : `${base}${fontUrl}`;
          const existingStyle = document.querySelector(`style[data-font-url="${newFontUrl}"]`);
          if (existingStyle) return;
          const style = document.createElement("style");
          style.setAttribute("data-font-url", newFontUrl);
          style.textContent = `@import url('${newFontUrl}');`;
          document.head.appendChild(style);
        });
      };
      injectFonts(fonts);
};
