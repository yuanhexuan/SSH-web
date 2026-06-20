import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Connect from "@/pages/Connect";
import Terminal from "@/pages/Terminal";
import FileManager from "@/pages/FileManager";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Connect />} />
        <Route path="/terminal/:sessionId" element={<Terminal />} />
        <Route path="/files/:sessionId" element={<FileManager />} />
      </Routes>
    </Router>
  );
}
