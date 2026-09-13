import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { FullPageLoader } from "./components/ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import GenerateExam from "./pages/GenerateExam";
import PublishedExams from "./pages/PublishedExams";
import Attempts from "./pages/Attempts";
import Analytics from "./pages/Analytics";
import LiveProctoring from "./pages/LiveProctoring";
import AddQuestion from "./pages/AddQuestion";
import ManageTeachers from "./pages/ManageTeachers";
import StudentExam from "./pages/StudentExam";
import AdaptivePractice from "./pages/AdaptivePractice";
import ChapterIntelligence from "./pages/insights/ChapterIntelligence";
import QuestionTrends from "./pages/insights/QuestionTrends";
import ExamPatterns from "./pages/insights/ExamPatterns";
import QuestionBankHealth from "./pages/insights/QuestionBankHealth";
import StudentProfiles from "./pages/insights/StudentProfiles";
import ClassAnalytics from "./pages/insights/ClassAnalytics";
import AiInsights from "./pages/insights/AiInsights";
import PracticeGenerator from "./pages/insights/PracticeGenerator";
import AdaptiveDemo from "./pages/insights/AdaptiveDemo";

function TeacherRoute({ children }) {
  const { user } = useAuth();
  if (user === null) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role !== "teacher") return <Navigate to="/exam" replace />;
  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (user === null) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user === null) return <FullPageLoader />;
  if (user && user.role === "admin") return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
}

function Shell() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/exam" element={<StudentExam />} />
      <Route path="/practice" element={<AdaptivePractice />} />
      <Route path="/admin" element={<AdminRoute><ManageTeachers /></AdminRoute>} />
      <Route path="/dashboard" element={<TeacherRoute><Dashboard /></TeacherRoute>} />
      <Route path="/generate" element={<TeacherRoute><GenerateExam /></TeacherRoute>} />
      <Route path="/exams" element={<TeacherRoute><PublishedExams /></TeacherRoute>} />
      <Route path="/questions" element={<TeacherRoute><AddQuestion /></TeacherRoute>} />
      <Route path="/proctoring" element={<TeacherRoute><LiveProctoring /></TeacherRoute>} />
      <Route path="/attempts" element={<TeacherRoute><Attempts /></TeacherRoute>} />
      <Route path="/analytics" element={<TeacherRoute><Analytics /></TeacherRoute>} />
      <Route path="/insights/chapters" element={<TeacherRoute><ChapterIntelligence /></TeacherRoute>} />
      <Route path="/insights/trends" element={<TeacherRoute><QuestionTrends /></TeacherRoute>} />
      <Route path="/insights/patterns" element={<TeacherRoute><ExamPatterns /></TeacherRoute>} />
      <Route path="/insights/bank-health" element={<TeacherRoute><QuestionBankHealth /></TeacherRoute>} />
      <Route path="/insights/students" element={<TeacherRoute><StudentProfiles /></TeacherRoute>} />
      <Route path="/insights/classes" element={<TeacherRoute><ClassAnalytics /></TeacherRoute>} />
      <Route path="/insights/ai" element={<TeacherRoute><AiInsights /></TeacherRoute>} />
      <Route path="/insights/practice" element={<TeacherRoute><PracticeGenerator /></TeacherRoute>} />
      <Route path="/insights/adaptive" element={<TeacherRoute><AdaptiveDemo /></TeacherRoute>} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}
