import React from "react";
import copyrightConfig from "../config/copyright.config.json";

const CopyrightNotice: React.FC = () => {
  return (
    <footer className="copyright-notice" role="contentinfo" aria-label="Copyright attribution">
      <div className="copyright-attribution">{copyrightConfig.attribution}</div>
      <div className="copyright-text">{copyrightConfig.copyright}</div>
    </footer>
  );
};

export default CopyrightNotice;
