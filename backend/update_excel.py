import pandas as pd
import random
file_path = 'backend/excel/HOSTELEASE_6_Hostel_Master_Database.xlsx'
df_dict = pd.read_excel(file_path, sheet_name=None)
df_students = df_dict['Students_Master']

if 'DOB' not in df_students.columns:
    df_students['DOB'] = [f'{random.randint(1,28):02d}-{random.randint(1,12):02d}-{random.randint(2000, 2005)}' for _ in range(len(df_students))]

with pd.ExcelWriter(file_path) as writer:
    for k, v in df_dict.items():
        v.to_excel(writer, sheet_name=k, index=False)
print('Excel updated')
