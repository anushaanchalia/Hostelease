export const getUser = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse user from localStorage:', error);
    return null;
  }
};

export const getToken = () => {
  try {
    return localStorage.getItem('token');
  } catch (error) {
    console.error('Failed to get token from localStorage:', error);
    return null;
  }
};

export const setAuth = (token, user) => {
  try {
    if (token) {
      localStorage.setItem('token', token);
    }

    if (user) {
      const normalizedUser = {
        ...user,
        hostel_name: user?.hostel_name || user?.hostel || 'N/A',
        block: user?.block || user?.block_name || 'N/A',
        room_number: user?.room_number || 'N/A'
      };
      localStorage.setItem('user', JSON.stringify(normalizedUser));
    }
  } catch (error) {
    console.error('Failed to save auth data:', error);
  }
};

export const clearAuth = () => {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch (error) {
    console.error('Failed to clear auth data:', error);
  }
};

export const isAuthenticated = () => {
  return !!getToken();
};