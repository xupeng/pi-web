import { configureIosSafeAreaViewport } from "./pwaDisplayMode";
import "./components/PiWebApp";

// Runs before the first Lit render upgrades <pi-web-app>, so iOS standalone
// PWAs never flash the full-bleed viewport.
configureIosSafeAreaViewport();
