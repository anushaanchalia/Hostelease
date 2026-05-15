import React from 'react';
import { Navigate } from 'react-router-dom';
import { getUser, isAuthenticated, getToken } from '../utils/auth';

const ProtectedRoute = ({ children, role }) => {
  const token = getToken();
  const authenticated = isAuthenticated();
  const user = getUser();

  if (!authenticated || !token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
  }

  if (role === 'admin' && user?.is_default_password) {
    if (!window.location.pathname.includes('/admin/profile')) {
      return <Navigate to="/admin/profile" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;