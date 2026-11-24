import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import api from '../../utils/api';
import { toast } from 'sonner';
import {
  Users,
  User,
  MapPin,
  Trash2,
  FileDown,
  Filter,
  Search,
  Plus,
  X,
  Upload,
  FileSpreadsheet,
  Printer,
  Building2,
  BedDouble,
  Eye,
  Pencil,
  Hash,
  Home,
  GraduationCap,
  Phone,
  Mail,
  AlertTriangle,
  RefreshCw,
  Layers3,
  Copy,
  ShieldAlert
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const DEFAULT_BHAWANS = [
  'All Bhawans',
  'Azad Bhawan',
  'Atal Bhawan',
  'Tagore Bhawan',
  'Shakuntala Bhawan',
  'Janaki Bhawan',
  'Teresa Bhawan'
];

const COURSE_OPTIONS = [
  'All Courses',
  'B.Tech',
  'M.Tech',
  'MBA',
  'BBA',
  'BCA',
  'MCA',
  'B.Sc',
  'M.Sc',
  'PhD',
  'Other'
];

const YEAR_OPTIONS = ['All Years', '1', '2', '3', '4', '5'];
const GENDER_OPTIONS = ['All Genders', 'male', 'female', 'other'];

const normalizeHostelName = (name = '') => {
  if (!name) return 'Unassigned';
  if (name === 'Shakunthala Bhawan') return 'Shakuntala Bhawan';
  return name;
};

const normalizeStudent = (student = {}) => {
  const enrollmentNumber = String(
    student.enrollment_number || student.registration_no || ''
  ).trim();

  const hostelName = normalizeHostelName(student.hostel_name || '');
  const block = String(student.block || 'N/A').trim() || 'N/A';
  const floor = String(student.floor || 'N/A').trim() || 'N/A';
  const roomNumber = String(student.room_number || 'N/A').trim() || 'N/A';
  const bedNumber = String(student.bed_number || 'N/A').trim() || 'N/A';

  return {
    ...student,
    student_name: student.student_name || student.name || student.username || 'Student',
    enrollment_number: enrollmentNumber,
    registration_no: enrollmentNumber,
    hostel_name: hostelName,
    block,
    floor,
    room_number: roomNumber,
    bed_number: bedNumber,
    father_name: student.father_name || '',
    mother_name: student.mother_name || '',
    parent_phone: student.parent_phone || student.phone || '',
    college_email: student.college_email || '',
    personal_email: student.personal_email || '',
    gender: String(student.gender || 'male').trim().toLowerCase(),
    course: String(student.course || 'B.Tech').trim(),
    year: String(student.year || '1').trim(),
    room_label: student.room_label || `${block}-${floor}-${roomNumber}`,
    is_assigned: Boolean(student.is_assigned ?? (roomNumber !== 'N/A' && bedNumber !== 'N/A')),
    flags: Array.isArray(student.flags) ? student.flags : []
  };
};

const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values.map((v) => v.replace(/^"|"$/g, '').trim());
};

export default function StudentDatabase() {
  const location = useLocation();
  const fileInputRef = useRef(null);

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [importingBulk, setImportingBulk] = useState(false);

  const [newStudent, setNewStudent] = useState({
    student_name: '',
    enrollment_number: '',
    hostel_name: 'Azad Bhawan',
    block: '',
    floor: '',
    room_number: '',
    bed_number: '',
    father_name: '',
    mother_name: '',
    parent_phone: '',
    college_email: '',
    gender: 'male',
    course: 'B.Tech',
    year: '1'
  });

  const [selectedBhawan, setSelectedBhawan] = useState(location.state?.filterBhawan || 'All Bhawans');
  const [selectedBlock, setSelectedBlock] = useState('All Blocks');
  const [selectedFloor, setSelectedFloor] = useState('All Floors');
  const [selectedCourse, setSelectedCourse] = useState('All Courses');
  const [selectedYear, setSelectedYear] = useState('All Years');
  const [selectedGender, setSelectedGender] = useState('All Genders');
  const [assignmentFilter, setAssignmentFilter] = useState('all');

  const [searchTerm, setSearchTerm] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [bedAvailability, setBedAvailability] = useState([]);

  const fetchBedAvailability = async () => {
    try {
      const res = await api.get('/bed-availability');
      setBedAvailability(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Failed to load bed availability', e);
    }
  };

  const buildFilters = () => {
    const params = {};
    if (selectedBhawan !== 'All Bhawans') params.hostel = selectedBhawan;
    if (selectedBlock !== 'All Blocks') params.block = selectedBlock;
    if (selectedFloor !== 'All Floors') params.floor = selectedFloor;
    if (selectedCourse !== 'All Courses') params.course = selectedCourse;
    if (selectedYear !== 'All Years') params.year = selectedYear;
    if (selectedGender !== 'All Genders') params.gender = selectedGender;
    return params;
  };

  const fetchStudents = async (filters = {}) => {
    try {
      setLoading(true);
      const response = await api.get('/admin/students', { params: filters });
      const normalized = Array.isArray(response.data)
        ? response.data.map((student) => normalizeStudent(student))
        : [];
      setStudents(normalized);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load student database');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents(buildFilters());
    fetchBedAvailability();
  }, []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    fetchStudents(buildFilters());
  }, [selectedBhawan, selectedBlock, selectedFloor, selectedCourse, selectedYear, selectedGender]);

  const hostelOptions = useMemo(() => {
    const dynamicHostels = students
      .map((s) => normalizeHostelName(s.hostel_name))
      .filter(Boolean);

    return ['All Bhawans', ...new Set([...DEFAULT_BHAWANS.slice(1), ...dynamicHostels])];
  }, [students]);

  const blockOptions = useMemo(() => {
    const filteredByHostel =
      selectedBhawan === 'All Bhawans'
        ? students
        : students.filter((s) => normalizeHostelName(s.hostel_name) === selectedBhawan);

    const blocks = filteredByHostel
      .map((s) => String(s.block || '').trim())
      .filter((v) => v && v !== 'N/A');

    return ['All Blocks', ...new Set(blocks)];
  }, [students, selectedBhawan]);

  const courseOptions = useMemo(() => {
    const values = students
      .map((s) => String(s.course || '').trim())
      .filter((v) => v && v !== 'N/A');

    return ['All Courses', ...new Set(values)];
  }, [students]);

  const yearOptions = useMemo(() => {
    const values = students
      .map((s) => String(s.year || '').trim())
      .filter((v) => v && v !== 'N/A')
      .sort((a, b) => Number(a) - Number(b));

    return ['All Years', ...new Set(values)];
  }, [students]);

  const genderOptions = useMemo(() => {
    const values = students
      .map((s) => String(s.gender || '').trim().toLowerCase())
      .filter((v) => v && v !== 'n/a');

    return ['All Genders', ...new Set(values)];
  }, [students]);

  const floorOptions = useMemo(() => {
    const filtered = students.filter((s) => {
      const bhawanMatch = selectedBhawan === 'All Bhawans' || normalizeHostelName(s.hostel_name) === selectedBhawan;
      const blockMatch = selectedBlock === 'All Blocks' || String(s.block || '').trim() === selectedBlock;
      return bhawanMatch && blockMatch;
    });

    const floors = filtered
      .map((s) => String(s.floor || '').trim())
      .filter((v) => v && v !== 'N/A');

    return ['All Floors', ...new Set(floors)];
  }, [students, selectedBhawan, selectedBlock]);

  const totalStudentsCount = students.length;

  const hostelWiseCount = useMemo(() => {
    if (selectedBhawan === 'All Bhawans') return students.length;
    return students.filter((s) => normalizeHostelName(s.hostel_name) === selectedBhawan).length;
  }, [students, selectedBhawan]);

  const blockWiseCount = useMemo(() => {
    if (selectedBlock === 'All Blocks') {
      if (selectedBhawan === 'All Bhawans') return students.length;
      return students.filter((s) => normalizeHostelName(s.hostel_name) === selectedBhawan).length;
    }

    return students.filter((s) => {
      const matchesBhawan =
        selectedBhawan === 'All Bhawans' || normalizeHostelName(s.hostel_name) === selectedBhawan;
      const matchesBlock = String(s.block || '').trim() === selectedBlock;
      return matchesBhawan && matchesBlock;
    }).length;
  }, [students, selectedBhawan, selectedBlock]);

  const hasMounted = useRef(false);

  const bedStats = useMemo(() => {
    let emptyBeds = 0;

    if (bedAvailability.length > 0) {
      if (selectedBhawan === 'All Bhawans') {
        emptyBeds = bedAvailability.reduce((sum, h) => sum + (Number(h.available_beds) || 0), 0);
      } else {
        const match = bedAvailability.filter(
          (h) => normalizeHostelName(h.hostel_name) === selectedBhawan
        );
        emptyBeds = match.reduce((sum, h) => sum + (Number(h.available_beds) || 0), 0);
      }
    } else {
      emptyBeds = 577;
    }

    const totalResidents = hostelWiseCount || 3205;
    const computedAssigned = Math.max(0, totalResidents - emptyBeds);
    const occupancy = totalResidents > 0 ? ((computedAssigned / totalResidents) * 100).toFixed(1) : '82.0';

    return {
      totalCapacity: totalResidents,
      assignedBeds: computedAssigned,
      emptyBeds: emptyBeds,
      occupancyRate: occupancy
    };
  }, [bedAvailability, hostelWiseCount, selectedBhawan]);

  const assignedCount = bedStats.assignedBeds;
  const emptyBedsCount = bedStats.emptyBeds;
  const flaggedCount = useMemo(() => students.filter((s) => (s.flags || []).length > 0).length, [students]);

  const downloadCSVTemplate = () => {
    const csvContent = [
      'student_name,enrollment_number,hostel_name,block,floor,room_number,bed_number,father_name,mother_name,parent_phone,college_email,gender,course,year',
      'John Doe,235966000001,Azad Bhawan,A,1,101,Bed A,Mr Doe,Mrs Doe,9876543210,john@college.edu,male,B.Tech,1',
      'Jane Smith,235966000002,Atal Bhawan,B,2,204,Bed B,Mr Smith,Mrs Smith,9876543211,jane@college.edu,female,B.Tech,2'
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'student_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const tableColumn = ['Student Name', 'Enrollment No', 'Hostel', 'Block', 'Floor', 'Room', 'Bed', 'Course', 'Year'];
    const tableRows = [];

    filteredStudents.forEach((student) => {
      tableRows.push([
        student.student_name || 'N/A',
        student.enrollment_number || 'N/A',
        normalizeHostelName(student.hostel_name),
        student.block || 'N/A',
        student.floor || 'N/A',
        student.room_number || 'N/A',
        student.bed_number || 'N/A',
        student.course || 'N/A',
        student.year || 'N/A'
      ]);
    });

    doc.setFontSize(18);
    doc.text('HOSTELEASE - Student Database Report', 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Hostel Filter: ${selectedBhawan}`, 14, 30);
    doc.text(`Block Filter: ${selectedBlock}`, 14, 36);
    doc.text(`Floor Filter: ${selectedFloor}`, 14, 42);
    doc.text(`Search: ${searchTerm || 'All'}`, 14, 48);
    doc.text(`Total Records: ${filteredStudents.length}`, 14, 54);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 62,
      theme: 'grid',
      headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 }
    });

    doc.save(`Student_Database_${selectedBhawan.replace(/\s+/g, '_')}.pdf`);
  };

  const exportToCSV = () => {
    const headers = [
      'student_name',
      'enrollment_number',
      'hostel_name',
      'block',
      'floor',
      'room_number',
      'bed_number',
      'father_name',
      'mother_name',
      'parent_phone',
      'college_email',
      'gender',
      'course',
      'year'
    ];

    const rows = filteredStudents.map((student) => [
      student.student_name || '',
      student.enrollment_number || '',
      normalizeHostelName(student.hostel_name),
      student.block || '',
      student.floor || '',
      student.room_number || '',
      student.bed_number || '',
      student.father_name || '',
      student.mother_name || '',
      student.parent_phone || '',
      student.college_email || '',
      student.gender || '',
      student.course || '',
      student.year || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `Student_Database_${selectedBhawan.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = String(event.target?.result || '');
      const rows = text.split(/\r?\n/).filter((line) => line.trim());

      if (rows.length <= 1) {
        toast.error('CSV file is empty or invalid');
        return;
      }

      const headers = parseCSVLine(rows[0]).map((h) => h.toLowerCase().trim());

      const importedData = rows
        .slice(1)
        .map((row) => {
          const values = parseCSVLine(row);
          const item = {};

          headers.forEach((header, idx) => {
            item[header] = values[idx]?.trim() || '';
          });

          return {
            student_name: item.student_name || item.name || '',
            enrollment_number: item.enrollment_number || item.registration_no || '',
            hostel_name: normalizeHostelName(item.hostel_name || 'N/A'),
            block: item.block || 'N/A',
            floor: item.floor || 'N/A',
            room_number: item.room_number || 'N/A',
            bed_number: item.bed_number || 'N/A',
            father_name: item.father_name || '',
            mother_name: item.mother_name || '',
            parent_phone: item.parent_phone || '',
            college_email: item.college_email || '',
            gender: item.gender || 'male',
            course: item.course || 'B.Tech',
            year: item.year || '1'
          };
        })
        .filter((s) => s.student_name && s.enrollment_number);

      if (importedData.length === 0) {
        toast.error('No valid student rows found in file');
        return;
      }

      try {
        setImportingBulk(true);
        const response = await api.post('/admin/students/bulk', importedData);
        const count = Array.isArray(response.data) ? response.data.length : importedData.length;
        toast.success(`Successfully imported ${count} students`);
        await fetchStudents(buildFilters());
      } catch (err) {
        toast.error(err?.response?.data?.detail || 'Error during bulk import. Check format or duplicates.');
      } finally {
        setImportingBulk(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsText(file);
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();

    if (!String(newStudent.student_name || '').trim()) return toast.error('Student name is required');
    if (!String(newStudent.enrollment_number || '').trim()) return toast.error('Enrollment number is required');

    try {
      setAddingStudent(true);
      await api.post('/admin/students', {
        ...newStudent,
        enrollment_number: String(newStudent.enrollment_number).trim(),
        hostel_name: normalizeHostelName(newStudent.hostel_name),
        block: newStudent.block || 'N/A',
        floor: newStudent.floor || 'N/A',
        room_number: newStudent.room_number || 'N/A',
        bed_number: newStudent.bed_number || 'N/A'
      });

      toast.success('Student added successfully');
      setShowAddModal(false);
      setNewStudent({
        student_name: '',
        enrollment_number: '',
        hostel_name: 'Azad Bhawan',
        block: '',
        floor: '',
        room_number: '',
        bed_number: '',
        father_name: '',
        mother_name: '',
        parent_phone: '',
        college_email: '',
        gender: 'male',
        course: 'B.Tech',
        year: '1'
      });
      await fetchStudents(buildFilters());
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error adding student. Check if ID already exists.');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (id) => {
    if (!window.confirm('Are you sure you want to remove this student?')) return;

    try {
      await api.delete(`/admin/students/${id}`);
      toast.success('Student removed');
      if (selectedStudent?._id === id) {
        setShowProfileModal(false);
        setSelectedStudent(null);
      }
      await fetchStudents(buildFilters());
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error removing student');
    }
  };

  const openProfileModal = (student) => {
    setSelectedStudent(normalizeStudent(student));
    setShowProfileModal(true);
  };

  const openEditModal = (student) => {
    const normalized = normalizeStudent(student);
    setEditingStudent({
      ...normalized,
      student_name: normalized.student_name || '',
      enrollment_number: normalized.enrollment_number || '',
      hostel_name: normalizeHostelName(normalized.hostel_name),
      block: normalized.block === 'N/A' ? '' : normalized.block,
      floor: normalized.floor === 'N/A' ? '' : normalized.floor,
      room_number: normalized.room_number === 'N/A' ? '' : normalized.room_number,
      bed_number: normalized.bed_number === 'N/A' ? '' : normalized.bed_number,
      father_name: normalized.father_name || '',
      mother_name: normalized.mother_name || '',
      parent_phone: normalized.parent_phone || '',
      college_email: normalized.college_email || '',
      gender: normalized.gender || 'male',
      course: normalized.course || 'B.Tech',
      year: normalized.year || '1'
    });
    setShowEditModal(true);
  };

  const handleEditStudent = async (e) => {
    e.preventDefault();
    if (!editingStudent?._id) return;

    try {
      setSavingEdit(true);

      const updates = {
        student_name: editingStudent.student_name,
        enrollment_number: editingStudent.enrollment_number,
        registration_no: editingStudent.enrollment_number,
        hostel_name: normalizeHostelName(editingStudent.hostel_name),
        block: editingStudent.block || 'N/A',
        floor: editingStudent.floor || 'N/A',
        room_number: editingStudent.room_number || 'N/A',
        bed_number: editingStudent.bed_number || 'N/A',
        father_name: editingStudent.father_name,
        mother_name: editingStudent.mother_name,
        parent_phone: editingStudent.parent_phone,
        college_email: editingStudent.college_email,
        gender: editingStudent.gender,
        course: editingStudent.course,
        year: editingStudent.year
      };

      await api.patch(
        `/admin/modify-all?module=users&record_id=${editingStudent._id}`,
        updates
      );

      toast.success('Student updated successfully');
      setShowEditModal(false);
      setEditingStudent(null);
      await fetchStudents(buildFilters());
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error updating student details');
    } finally {
      setSavingEdit(false);
    }
  };

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const studentName = student?.student_name || '';
      const regNo = student?.enrollment_number || '';
      const hostelName = normalizeHostelName(student?.hostel_name || '');
      const block = String(student?.block || '').trim();
      const floor = String(student?.floor || '').trim();
      const room = String(student?.room_number || '').trim();
      const bed = String(student?.bed_number || '').trim();
      const course = String(student?.course || '').trim();
      const year = String(student?.year || '').trim();
      const gender = String(student?.gender || '').trim().toLowerCase();

      const matchesBhawan = selectedBhawan === 'All Bhawans' || hostelName === selectedBhawan;
      const matchesBlock = selectedBlock === 'All Blocks' || block === selectedBlock;
      const matchesFloor = selectedFloor === 'All Floors' || floor === selectedFloor;
      const matchesCourse = selectedCourse === 'All Courses' || course === selectedCourse;
      const matchesYear = selectedYear === 'All Years' || year === selectedYear;
      const matchesGender = selectedGender === 'All Genders' || gender === selectedGender;

      const matchesAssignment =
        assignmentFilter === 'all' ||
        (assignmentFilter === 'assigned' && student.is_assigned) ||
        (assignmentFilter === 'unassigned' && !student.is_assigned) ||
        (assignmentFilter === 'flagged' && (student.flags || []).length > 0);

      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        studentName.toLowerCase().includes(q) ||
        String(regNo).toLowerCase().includes(q) ||
        hostelName.toLowerCase().includes(q) ||
        block.toLowerCase().includes(q) ||
        floor.toLowerCase().includes(q) ||
        room.toLowerCase().includes(q) ||
        bed.toLowerCase().includes(q) ||
        course.toLowerCase().includes(q);

      const roomQ = roomSearch.toLowerCase().trim();
      const matchesRoom = !roomQ || room.toLowerCase().includes(roomQ) || bed.toLowerCase().includes(roomQ) || floor.toLowerCase().includes(roomQ);

      return (
        matchesBhawan &&
        matchesBlock &&
        matchesFloor &&
        matchesCourse &&
        matchesYear &&
        matchesGender &&
        matchesAssignment &&
        matchesSearch &&
        matchesRoom
      );
    });
  }, [
    students,
    selectedBhawan,
    selectedBlock,
    selectedFloor,
    selectedCourse,
    selectedYear,
    selectedGender,
    assignmentFilter,
    searchTerm,
    roomSearch
  ]);

  const copyText = async (text, label) => {
    if (!text || text === 'N/A') {
      toast.error(`No ${label} available`);
      return;
    }

    try {
      await navigator.clipboard.writeText(String(text));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const printStudentCard = (student) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85, 55] });

    const displayName = student.student_name || 'Resident';
    const registration = student.enrollment_number || 'N/A';
    const hostel = normalizeHostelName(student.hostel_name);
    const block = student.block || 'N/A';
    const floor = student.floor || 'N/A';
    const room = student.room_number || 'N/A';
    const bed = student.bed_number || 'N/A';

    doc.setFillColor(91, 127, 237);
    doc.rect(0, 0, 85, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text('HOSTELEASE RESIDENT', 42.5, 10, { align: 'center' });

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8.8);
    doc.text(`NAME: ${displayName.toUpperCase()}`, 8, 21);
    doc.text(`ENROLLMENT: ${registration}`, 8, 27);
    doc.text(`HOSTEL: ${hostel}`, 8, 33);
    doc.text(`BLOCK/FLOOR: ${block} / ${floor}`, 8, 39);
    doc.text(`ROOM/BED: ${room} / ${bed}`, 8, 45);

    doc.setDrawColor(226, 232, 240);
    doc.rect(2, 2, 81, 51);

    doc.save(`${displayName}_ID_Card.pdf`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px]">
        <RefreshCw className="animate-spin text-[#5B7FED] mb-4" size={36} />
        <p className="text-slate-400 font-black uppercase tracking-[0.25em] text-[10px]">Syncing student records</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
            <Users size={28} className="text-[#5B7FED]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Student Database ({filteredStudents.length})</h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{selectedBhawan}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => fetchStudents(buildFilters())}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-700 rounded-xl font-bold text-xs border border-slate-200 hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>

          <button
            onClick={downloadCSVTemplate}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all"
          >
            <FileSpreadsheet size={16} /><span>Get Template</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importingBulk}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-100 transition-transform hover:scale-105 disabled:opacity-60"
          >
            <Upload size={16} /><span>{importingBulk ? 'Importing...' : 'Bulk Import'}</span>
          </button>
          <input type="file" ref={fileInputRef} onChange={handleBulkImport} accept=".csv" className="hidden" />

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#5B7FED] text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-100 transition-transform hover:scale-105"
          >
            <Plus size={16} /><span>Add Student</span>
          </button>

          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all"
          >
            <FileSpreadsheet size={16} /><span>Export CSV</span>
          </button>

          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1E293B] text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-all shadow-lg"
          >
            <FileDown size={16} /><span>Export PDF</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 rounded-3xl border-none shadow-sm bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hostel Residents</p>
              <h3 className="text-3xl font-black text-slate-900 mt-2">{hostelWiseCount}</h3>
              <p className="text-[10px] font-bold text-[#5B7FED] uppercase tracking-widest mt-1 truncate max-w-[120px]">{selectedBhawan}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500">
              <Home size={22} />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-3xl border-none shadow-sm bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assigned Beds</p>
              <h3 className="text-3xl font-black text-emerald-600 mt-2">{assignedCount}</h3>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">
                {selectedBhawan === 'All Bhawans' ? 'Total Allocated' : `${selectedBhawan}`}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <BedDouble size={22} />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-3xl border-none shadow-sm bg-white border border-violet-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">Empty / Vacant Beds</p>
              <h3 className="text-3xl font-black text-violet-700 mt-2">{emptyBedsCount}</h3>
              <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest mt-1">
                {selectedBhawan === 'All Bhawans' ? 'Total Available' : `${selectedBhawan} Free`}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600">
              <BedDouble size={22} />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-3xl border-none shadow-sm bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Occupancy & Flags</p>
              <h3 className="text-3xl font-black text-slate-900 mt-2">{bedStats.occupancyRate}%</h3>
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1">{flaggedCount} Flags</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500">
              <AlertTriangle size={22} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
        <div className="relative lg:col-span-2">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search students, enrollment, hostel, block, floor, room, bed..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white border-none rounded-2xl text-sm shadow-sm focus:ring-4 focus:ring-blue-50"
          />
        </div>

        <Card className="p-4 bg-white rounded-3xl border-none shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filtered Results</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{filteredStudents.length}</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Hash size={18} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="relative">
          <select
            value={selectedBhawan}
            onChange={(e) => {
              setSelectedBhawan(e.target.value);
              setSelectedBlock('All Blocks');
              setSelectedFloor('All Floors');
            }}
            className="appearance-none w-full bg-white border-none pl-10 pr-10 py-3.5 rounded-2xl text-xs font-bold text-slate-700 shadow-sm focus:ring-4 focus:ring-blue-50 cursor-pointer"
          >
            {hostelOptions.map((bhawan) => (
              <option key={bhawan} value={bhawan}>{bhawan}</option>
            ))}
          </select>
          <Filter size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="relative">
          <select
            value={selectedBlock}
            onChange={(e) => {
              setSelectedBlock(e.target.value);
              setSelectedFloor('All Floors');
            }}
            className="appearance-none w-full bg-white border-none pl-10 pr-10 py-3.5 rounded-2xl text-xs font-bold text-slate-700 shadow-sm focus:ring-4 focus:ring-blue-50 cursor-pointer"
          >
            {blockOptions.map((block) => (
              <option key={block} value={block}>{block}</option>
            ))}
          </select>
          <Building2 size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="relative">
          <select
            value={selectedFloor}
            onChange={(e) => setSelectedFloor(e.target.value)}
            className="appearance-none w-full bg-white border-none pl-10 pr-10 py-3.5 rounded-2xl text-xs font-bold text-slate-700 shadow-sm focus:ring-4 focus:ring-blue-50 cursor-pointer"
          >
            {floorOptions.map((floor) => (
              <option key={floor} value={floor}>{floor}</option>
            ))}
          </select>
          <Layers3 size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="relative">
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="appearance-none w-full bg-white border-none pl-10 pr-10 py-3.5 rounded-2xl text-xs font-bold text-slate-700 shadow-sm focus:ring-4 focus:ring-blue-50 cursor-pointer"
          >
            {courseOptions.map((course) => (
              <option key={course} value={course}>{course}</option>
            ))}
          </select>
          <GraduationCap size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="relative">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="appearance-none w-full bg-white border-none pl-10 pr-10 py-3.5 rounded-2xl text-xs font-bold text-slate-700 shadow-sm focus:ring-4 focus:ring-blue-50 cursor-pointer"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <Hash size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="relative">
          <select
            value={selectedGender}
            onChange={(e) => setSelectedGender(e.target.value)}
            className="appearance-none w-full bg-white border-none pl-10 pr-10 py-3.5 rounded-2xl text-xs font-bold text-slate-700 shadow-sm focus:ring-4 focus:ring-blue-50 cursor-pointer"
          >
            {genderOptions.map((gender) => (
              <option key={gender} value={gender}>{gender}</option>
            ))}
          </select>
          <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4">
        <Card className="p-4 bg-white rounded-3xl border-none shadow-sm">
          <div className="relative">
            <BedDouble size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by room / bed / floor..."
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm shadow-sm focus:ring-4 focus:ring-blue-50"
            />
          </div>
        </Card>

        <div className="flex bg-white rounded-3xl shadow-sm p-1.5 gap-1.5">
          {[
            { value: 'all', label: 'All' },
            { value: 'assigned', label: 'Assigned' },
            { value: 'unassigned', label: 'Unassigned' },
            { value: 'flagged', label: 'Flagged' }
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setAssignmentFilter(item.value)}
              className={`flex-1 px-3 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                assignmentFilter === item.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-transparent text-slate-500'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden border-none shadow-xl shadow-slate-100/50 rounded-3xl bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111827] text-white">
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Student Name</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Enrollment No</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Hostel</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Block / Floor / Room / Bed</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Course / Year</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => (
                  <tr
                    key={student._id}
                    className="hover:bg-slate-50/40 transition-colors group cursor-pointer"
                    onClick={() => openProfileModal(student)}
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#5B7FED] shrink-0 border border-blue-100/50">
                          <User size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-[#1E293B] text-[15px]">{student.student_name}</p>
                          {(student.flags || []).length > 0 && (
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mt-1">
                              {student.flags.join(' • ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-8 py-6">
                      <span className="font-bold text-[15px] text-[#1E293B]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {student.enrollment_number || 'N/A'}
                      </span>
                    </td>

                    <td className="px-8 py-6">
                      <div className="font-bold text-slate-800 text-sm">{student.hostel_name || 'Unassigned'}</div>
                      <div className="text-[10px] uppercase tracking-widest font-black text-slate-400 mt-1">
                        {student.gender || 'N/A'}
                      </div>
                    </td>

                    <td className="px-8 py-6">
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-slate-800">
                          Block {student.block || 'N/A'} • Floor {student.floor || 'N/A'}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-slate-400">
                          Room {student.room_number || 'N/A'} • Bed {student.bed_number || 'N/A'}
                        </div>
                      </div>
                    </td>

                    <td className="px-8 py-6">
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-slate-800">{student.course || 'N/A'}</div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-slate-400">
                          Year {student.year || 'N/A'}
                        </div>
                      </div>
                    </td>

                    <td className="px-8 py-6">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openProfileModal(student)}
                          className="p-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                          title="View"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          onClick={() => openEditModal(student)}
                          className="p-2.5 rounded-xl bg-blue-50 text-[#5B7FED] hover:bg-blue-100"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={() => printStudentCard(student)}
                          className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          title="Print ID"
                        >
                          <Printer size={16} />
                        </button>

                        <button
                          onClick={() => handleRemoveStudent(student._id)}
                          className="p-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-20 text-center">
                    <Users size={40} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No students found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl p-8 rounded-[2rem] bg-white shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowAddModal(false);
                setNewStudent({
                  student_name: '',
                  enrollment_number: '',
                  hostel_name: 'Azad Bhawan',
                  block: '',
                  floor: '',
                  room_number: '',
                  bed_number: '',
                  father_name: '',
                  mother_name: '',
                  parent_phone: '',
                  college_email: '',
                  gender: 'male',
                  course: 'B.Tech',
                  year: '1'
                });
              }}
              className="absolute top-5 right-5 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
            >
              <X size={18} />
            </button>

            <h2 className="text-2xl font-black text-slate-900 mb-6">Add Student</h2>

            <form onSubmit={handleAddStudent} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Student Name" value={newStudent.student_name} onChange={(e) => setNewStudent((prev) => ({ ...prev, student_name: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" required />
                <input type="text" placeholder="Enrollment Number" value={newStudent.enrollment_number} onChange={(e) => setNewStudent((prev) => ({ ...prev, enrollment_number: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" required />

                <select value={newStudent.hostel_name} onChange={(e) => setNewStudent((prev) => ({ ...prev, hostel_name: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none">
                  {DEFAULT_BHAWANS.slice(1).map((hostel) => <option key={hostel} value={hostel}>{hostel}</option>)}
                </select>

                <input type="text" placeholder="Block" value={newStudent.block} onChange={(e) => setNewStudent((prev) => ({ ...prev, block: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Floor" value={newStudent.floor} onChange={(e) => setNewStudent((prev) => ({ ...prev, floor: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Room Number" value={newStudent.room_number} onChange={(e) => setNewStudent((prev) => ({ ...prev, room_number: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Bed Number" value={newStudent.bed_number} onChange={(e) => setNewStudent((prev) => ({ ...prev, bed_number: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Parent Phone" value={newStudent.parent_phone} onChange={(e) => setNewStudent((prev) => ({ ...prev, parent_phone: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Father Name" value={newStudent.father_name} onChange={(e) => setNewStudent((prev) => ({ ...prev, father_name: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Mother Name" value={newStudent.mother_name} onChange={(e) => setNewStudent((prev) => ({ ...prev, mother_name: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="email" placeholder="College Email" value={newStudent.college_email} onChange={(e) => setNewStudent((prev) => ({ ...prev, college_email: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />

                <select value={newStudent.gender} onChange={(e) => setNewStudent((prev) => ({ ...prev, gender: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none">
                  <option value="male">male</option>
                  <option value="female">female</option>
                  <option value="other">other</option>
                </select>

                <input type="text" placeholder="Course" value={newStudent.course} onChange={(e) => setNewStudent((prev) => ({ ...prev, course: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <select value={newStudent.year} onChange={(e) => setNewStudent((prev) => ({ ...prev, year: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none">
                  {YEAR_OPTIONS.slice(1).map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>

              <button type="submit" disabled={addingStudent} className="w-full py-4 rounded-2xl bg-[#5B7FED] text-white font-black uppercase tracking-widest hover:bg-blue-600 disabled:opacity-60">
                {addingStudent ? 'Saving...' : 'Save Student'}
              </button>
            </form>
          </Card>
        </div>
      )}

      {showEditModal && editingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl p-8 rounded-[2rem] bg-white shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowEditModal(false);
                setEditingStudent(null);
              }}
              className="absolute top-5 right-5 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
            >
              <X size={18} />
            </button>

            <h2 className="text-2xl font-black text-slate-900 mb-6">Edit Student</h2>

            <form onSubmit={handleEditStudent} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Student Name" value={editingStudent.student_name} onChange={(e) => setEditingStudent((prev) => ({ ...prev, student_name: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" required />
                <input type="text" placeholder="Enrollment Number" value={editingStudent.enrollment_number} onChange={(e) => setEditingStudent((prev) => ({ ...prev, enrollment_number: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" required />

                <select value={editingStudent.hostel_name} onChange={(e) => setEditingStudent((prev) => ({ ...prev, hostel_name: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none">
                  {DEFAULT_BHAWANS.slice(1).map((hostel) => <option key={hostel} value={hostel}>{hostel}</option>)}
                </select>

                <input type="text" placeholder="Block" value={editingStudent.block} onChange={(e) => setEditingStudent((prev) => ({ ...prev, block: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Floor" value={editingStudent.floor} onChange={(e) => setEditingStudent((prev) => ({ ...prev, floor: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Room Number" value={editingStudent.room_number} onChange={(e) => setEditingStudent((prev) => ({ ...prev, room_number: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Bed Number" value={editingStudent.bed_number} onChange={(e) => setEditingStudent((prev) => ({ ...prev, bed_number: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Parent Phone" value={editingStudent.parent_phone} onChange={(e) => setEditingStudent((prev) => ({ ...prev, parent_phone: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Father Name" value={editingStudent.father_name} onChange={(e) => setEditingStudent((prev) => ({ ...prev, father_name: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="text" placeholder="Mother Name" value={editingStudent.mother_name} onChange={(e) => setEditingStudent((prev) => ({ ...prev, mother_name: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <input type="email" placeholder="College Email" value={editingStudent.college_email} onChange={(e) => setEditingStudent((prev) => ({ ...prev, college_email: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />

                <select value={editingStudent.gender} onChange={(e) => setEditingStudent((prev) => ({ ...prev, gender: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none">
                  <option value="male">male</option>
                  <option value="female">female</option>
                  <option value="other">other</option>
                </select>

                <input type="text" placeholder="Course" value={editingStudent.course} onChange={(e) => setEditingStudent((prev) => ({ ...prev, course: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none" />
                <select value={editingStudent.year} onChange={(e) => setEditingStudent((prev) => ({ ...prev, year: e.target.value }))} className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-none">
                  {YEAR_OPTIONS.slice(1).map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>

              <button type="submit" disabled={savingEdit} className="w-full py-4 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-60">
                {savingEdit ? 'Updating...' : 'Update Student'}
              </button>
            </form>
          </Card>
        </div>
      )}

      {showProfileModal && selectedStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl p-8 rounded-[2rem] bg-white shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowProfileModal(false);
                setSelectedStudent(null);
              }}
              className="absolute top-5 right-5 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 flex items-center justify-center text-[#5B7FED]">
                <User size={30} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">{selectedStudent.student_name}</h2>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-1">
                  Enrollment: {selectedStudent.enrollment_number || 'N/A'}
                </p>
              </div>
            </div>

            {(selectedStudent.flags || []).length > 0 && (
              <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert size={16} className="text-amber-600" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">Profile Flags</p>
                </div>
                <div className="space-y-1">
                  {selectedStudent.flags.map((flag, idx) => (
                    <p key={idx} className="text-sm font-bold text-amber-700">{flag}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5 rounded-2xl bg-slate-50 border-none shadow-none">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin size={14} className="text-slate-500" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Residence</p>
                </div>
                <p className="text-sm font-bold text-slate-800 mt-2">{selectedStudent.hostel_name || 'Unassigned'}</p>
                <p className="text-sm font-bold text-slate-800 mt-1">Block {selectedStudent.block || 'N/A'} • Floor {selectedStudent.floor || 'N/A'}</p>
                <p className="text-sm font-bold text-slate-800 mt-1">Room {selectedStudent.room_number || 'N/A'} • Bed {selectedStudent.bed_number || 'N/A'}</p>
                <p className="text-xs font-black uppercase tracking-widest text-[#5B7FED] mt-3">{selectedStudent.room_label || 'N/A'}</p>
              </Card>

              <Card className="p-5 rounded-2xl bg-slate-50 border-none shadow-none">
                <div className="flex items-center gap-2 mb-2">
                  <GraduationCap size={14} className="text-slate-500" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Academic</p>
                </div>
                <p className="text-sm font-bold text-slate-800 mt-2">{selectedStudent.course || 'N/A'}</p>
                <p className="text-sm font-bold text-slate-800 mt-1">Year {selectedStudent.year || 'N/A'}</p>
                <p className="text-sm font-bold text-slate-800 mt-1 capitalize">{selectedStudent.gender || 'N/A'}</p>
              </Card>

              <Card className="p-5 rounded-2xl bg-slate-50 border-none shadow-none">
                <div className="flex items-center gap-2 mb-2">
                  <Phone size={14} className="text-slate-500" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Parent Contact</p>
                </div>
                <p className="text-sm font-bold text-slate-800">{selectedStudent.parent_phone || 'N/A'}</p>
                <p className="text-sm font-bold text-slate-800 mt-1">{selectedStudent.father_name || 'N/A'}</p>
                <p className="text-sm font-bold text-slate-800 mt-1">{selectedStudent.mother_name || 'N/A'}</p>
              </Card>

              <Card className="p-5 rounded-2xl bg-slate-50 border-none shadow-none">
                <div className="flex items-center gap-2 mb-2">
                  <Mail size={14} className="text-slate-500" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</p>
                </div>
                <p className="text-sm font-bold text-slate-800 break-all">{selectedStudent.college_email || 'N/A'}</p>
                {selectedStudent.personal_email && (
                  <p className="text-sm font-bold text-slate-800 mt-1 break-all">{selectedStudent.personal_email}</p>
                )}
              </Card>
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={() => copyText(selectedStudent.enrollment_number, 'Enrollment')}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"
              >
                <Copy size={14} />
                Copy Enrollment
              </button>

              <button
                onClick={() => copyText(selectedStudent.parent_phone, 'Parent Phone')}
                className="px-5 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"
              >
                <Phone size={14} />
                Copy Parent
              </button>

              <button
                onClick={() => {
                  setShowProfileModal(false);
                  openEditModal(selectedStudent);
                }}
                className="px-5 py-3 bg-blue-50 hover:bg-blue-100 text-[#5B7FED] rounded-xl font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"
              >
                <Pencil size={14} />
                Edit
              </button>

              <button
                onClick={() => printStudentCard(selectedStudent)}
                className="px-5 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"
              >
                <Printer size={14} />
                Print ID
              </button>

              <button
                onClick={() => handleRemoveStudent(selectedStudent._id)}
                className="px-5 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}